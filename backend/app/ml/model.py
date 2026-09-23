"""Модель: эмпирическая кривая мощности по прогнозному v_eq + бустинг на остатках."""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression

from app.ml.features import FEATURES as DEFAULT_FEATURES

BIN_W = 0.25
V_MAX = 30.0
CUT_IN, CUT_OUT = 1.5, 25.0


class PowerCurve:
    """Медиана мощности по бинам v_eq, сглаживание, монотонность (изотоника)."""

    def fit(self, v, p):
        df = pd.DataFrame({"v": np.asarray(v, float), "p": np.asarray(p, float)}).dropna()
        if len(df) < 50:
            raise ValueError("Слишком мало данных для кривой мощности")
        edges = np.arange(0, V_MAX + BIN_W, BIN_W)
        df["bin"] = pd.cut(df["v"], edges, labels=edges[:-1] + BIN_W / 2)
        med = df.groupby("bin", observed=True)["p"].agg(["median", "size"])
        med = med[med["size"] >= 5]
        centers = med.index.astype(float).to_numpy()
        vals = med["median"].rolling(3, center=True, min_periods=1).median().to_numpy()
        iso = IsotonicRegression(y_min=0, y_max=1, increasing=True)
        self.v_ = centers
        self.p_ = iso.fit_transform(centers, vals, sample_weight=med["size"].to_numpy())
        return self

    def __call__(self, v):
        v = np.asarray(v, float)
        p = np.interp(v, self.v_, self.p_, left=0.0, right=self.p_[-1])
        p[(v < CUT_IN) | (v > CUT_OUT)] = 0.0
        return np.clip(p, 0, 1)

    def table(self):
        return [{"v": round(float(a), 2), "p": round(float(b), 4)} for a, b in zip(self.v_, self.p_)]


class WindPowerModel:
    def __init__(self, max_iter=300, learning_rate=0.05, random_state=0, features=None):
        self.features = list(features or DEFAULT_FEATURES)
        self.curve = PowerCurve()
        self.reg = HistGradientBoostingRegressor(max_iter=max_iter, learning_rate=learning_rate,
                                                 max_leaf_nodes=31, l2_regularization=1.0,
                                                 random_state=random_state)
        # квантильный бустинг остатков (Landry et al., 2016): нижняя и верхняя границы диапазона 80 %
        self.quant = {q: HistGradientBoostingRegressor(loss="quantile", quantile=q, max_iter=200,
                                                       learning_rate=learning_rate, max_leaf_nodes=31,
                                                       random_state=random_state) for q in (0.1, 0.9)}

    def fit(self, X: pd.DataFrame, y):
        """X — признаки make_features (без столбца curve), y — факт мощности.
        Строки простоя (is_downtime) должны быть исключены вызывающим."""
        y = np.asarray(y, float)
        self.curve.fit(X["v_eq"], y)
        X = X.assign(curve=self.curve(X["v_eq"]))
        resid = y - X["curve"].to_numpy()
        self.reg.fit(X[self.features], resid)
        for m in self.quant.values():
            m.fit(X[self.features], resid)
        self.n_train_ = len(y)
        return self

    def predict_parts(self, X: pd.DataFrame):
        c = self.curve(X["v_eq"])
        res = self.reg.predict(X.assign(curve=c)[self.features])
        return c, np.clip(c + res, 0, 1)

    def predict_interval(self, X: pd.DataFrame):
        """Q10 и Q90 мощности; монотонность гарантируется: lo ≤ p ≤ hi."""
        c, p = self.predict_parts(X)
        Xc = X.assign(curve=c)[self.features]
        lo = np.clip(c + self.quant[0.1].predict(Xc), 0, 1)
        hi = np.clip(c + self.quant[0.9].predict(Xc), 0, 1)
        return c, p, np.minimum(lo, p), np.maximum(hi, p)

    def predict(self, X):
        return self.predict_parts(X)[1]
