import { usePrefs, type Lang } from './prefs'

const RU = {
  app: 'AI Прогноз', section: 'Выработка ВЭС', ctx: '{n} турбины · {mw} МВт · {model}',
  f_object: 'Объект', f_horizon: 'Горизонт', f_issue: 'Выпуск', f_view: 'Вид', chart: 'График', table: 'Таблица',
  station: 'ВЭС «Нурлы»', root: 'Генерация ВИЭ', t1: 'Турбина 1', t2: 'Турбина 2', h24: '24 ч', h48: '48 ч',
  k_forecast: 'Прогноз', k_fact: 'Факт', k_dev: 'Отклонение', k_peak: 'Пик прогноза', k_acc: 'Точность',
  c_forecast: 'энергия за горизонт', c_fact: 'по часам с фактом', c_nofact: 'факт ещё не наступил',
  c_dev: 'прогноз − факт · допуск ±{tol}%', c_peak: 'в {t} по Алматы', c_acc: '100 − MAE/Pном по часам с фактом',
  mwh: 'МВт·ч', mw: 'МВт',
  tree: 'Объекты', list: 'Турбины', l_rated: 'Pном', l_forecast: 'Прогноз', l_fact: 'Факт',
  tol: 'допуск ±{tol}%', peak: 'пик прогноза {mw} МВт в {t}', reset_zoom: 'Сбросить масштаб', export: 'CSV',
  layer_wind: 'Ветер 100 м', layer_temp: 'Температура', layer_gust: 'Порывы',
  loading: 'Загрузка данных прогноза…', err: 'Ошибка', nodata: 'За выбранный выпуск данных нет.',
  th_time: 'Время', th_forecast: 'Прогноз, МВт', th_fact: 'Факт, МВт', th_dev: 'Откл., МВт', th_devp: 'Откл., %', th_wind: 'Ветер, м/с', th_temp: 'T, °C',
  why: 'Почему такой прогноз', why_point: 'Контрольная точка — пик прогноза', why_wind: 'ветер 100 м', why_gust: 'порывы', why_temp: 'температура', why_dir: 'направление',
  why_decisions: 'Решения агента', why_none: 'пересчётов и тревог не было', why_status_ok: 'данные полные', why_status_low: 'пониженная достоверность',
  p_curve: 'Кривая мощности', hours_hist: 'ч истории', p_daily: 'Ошибка по дням · январь', base: 'База',
  p_feb: 'Тестовый период · февраль', p_quality: 'Качество данных', q_gaps: 'пропусков', q_hours: 'ч без данных', q_longest: 'самый длинный, ч', q_monthly: 'часы без данных по месяцам',
  no_days: 'Нет дней с фактом.', no_feb: 'Прогнозов на февраль нет.', calc_curve: 'Считаю кривую…',
  rerun: 'Пересчитать выпуск', calc: 'Считаю…', done: 'Готово',
  agent: 'Инженер-агент', online: 'на связи', working: 'работает…', ask_ph: 'Ваш вопрос', ask: 'Спросить', ask_hint: 'Спросите о прогнозе выработки',
  chips: ['Насколько точна модель?', 'Прогноз на 12.02', 'Почему пересчёт 25.02?'],
  s_forecast: 'Смотрю прогноз на {d}', s_metrics: 'Проверяю точность модели', s_log: 'Разбираю решения за {d}', s_run: 'Пересчитываю прогноз на {d}', s_other: 'Собираю данные',
  a_fail: 'Не получилось', a_lost: 'Связь с агентом прервалась, попробуйте ещё раз.',
  theme_light: 'Светлая тема', theme_dark: 'Тёмная тема', almaty: 'Алматы',
  footer: 'Infinity AI · HackAlem AI 2026 · трек «Энергетика»',
}
export type Dict = typeof RU

const KK: Dict = {
  app: 'AI Болжам', section: 'ЖЭС өндірісі', ctx: '{n} турбина · {mw} МВт · {model}',
  f_object: 'Нысан', f_horizon: 'Көкжиек', f_issue: 'Шығарылым', f_view: 'Түрі', chart: 'График', table: 'Кесте',
  station: '«Нұрлы» ЖЭС', root: 'ЖЭК генерациясы', t1: '1-турбина', t2: '2-турбина', h24: '24 сағ', h48: '48 сағ',
  k_forecast: 'Болжам', k_fact: 'Нақты', k_dev: 'Ауытқу', k_peak: 'Болжам шыңы', k_acc: 'Дәлдік',
  c_forecast: 'көкжиектегі энергия', c_fact: 'нақты деректі сағаттар бойынша', c_nofact: 'нақты дерек әлі жоқ',
  c_dev: 'болжам − нақты · рұқсат ±{tol}%', c_peak: 'Алматы уақыты {t}', c_acc: '100 − MAE/Pном нақты сағаттар бойынша',
  mwh: 'МВт·сағ', mw: 'МВт',
  tree: 'Нысандар', list: 'Турбиналар', l_rated: 'Pном', l_forecast: 'Болжам', l_fact: 'Нақты',
  tol: 'рұқсат ±{tol}%', peak: 'болжам шыңы {mw} МВт, {t}', reset_zoom: 'Масштабты қалпына келтіру', export: 'CSV',
  layer_wind: 'Жел 100 м', layer_temp: 'Температура', layer_gust: 'Екпін',
  loading: 'Болжам деректері жүктелуде…', err: 'Қате', nodata: 'Таңдалған шығарылым бойынша дерек жоқ.',
  th_time: 'Уақыт', th_forecast: 'Болжам, МВт', th_fact: 'Нақты, МВт', th_dev: 'Ауытқу, МВт', th_devp: 'Ауытқу, %', th_wind: 'Жел, м/с', th_temp: 'T, °C',
  why: 'Неге осындай болжам', why_point: 'Бақылау нүктесі — болжам шыңы', why_wind: 'жел 100 м', why_gust: 'екпін', why_temp: 'температура', why_dir: 'бағыт',
  why_decisions: 'Агент шешімдері', why_none: 'қайта есептеу мен ескертулер болмады', why_status_ok: 'деректер толық', why_status_low: 'сенімділігі төмен',
  p_curve: 'Қуат қисығы', hours_hist: 'сағ тарих', p_daily: 'Күндер бойынша қате · қаңтар', base: 'База',
  p_feb: 'Тест кезеңі · ақпан', p_quality: 'Деректер сапасы', q_gaps: 'олқылық', q_hours: 'дерексіз сағ', q_longest: 'ең ұзағы, сағ', q_monthly: 'айлар бойынша дерексіз сағаттар',
  no_days: 'Нақты деректі күндер жоқ.', no_feb: 'Ақпанға болжам жоқ.', calc_curve: 'Қисықты есептеуде…',
  rerun: 'Шығарылымды қайта есептеу', calc: 'Есептеуде…', done: 'Дайын',
  agent: 'Инженер-агент', online: 'байланыста', working: 'жұмыс істеуде…', ask_ph: 'Сұрағыңыз', ask: 'Сұрау', ask_hint: 'Өндіріс болжамы туралы сұраңыз',
  chips: ['Модель қаншалықты дәл?', '12.02 болжамы', 'Неге 25.02 қайта есептелді?'],
  s_forecast: '{d} болжамын қараймын', s_metrics: 'Модель дәлдігін тексеремін', s_log: '{d} шешімдерін талдаймын', s_run: '{d} болжамын қайта есептеймін', s_other: 'Деректер жинаймын',
  a_fail: 'Орындалмады', a_lost: 'Агентпен байланыс үзілді, қайталап көріңіз.',
  theme_light: 'Жарық тақырып', theme_dark: 'Қараңғы тақырып', almaty: 'Алматы',
  footer: 'Infinity AI · HackAlem AI 2026 · «Энергетика» бағыты',
}

const DICT: Record<Lang, Dict> = { ru: RU, kk: KK }

export function useT() {
  const { lang } = usePrefs()
  const d = DICT[lang]
  const t = (key: keyof Dict, vars?: Record<string, string | number>) => {
    const v = d[key]
    if (Array.isArray(v)) return v.join(', ')
    return Object.entries(vars ?? {}).reduce((s, [k, val]) => s.replaceAll(`{${k}}`, String(val)), v as string)
  }
  return { t, d, lang }
}
