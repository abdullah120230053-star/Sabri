import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import { formatInTimeZone } from 'date-fns-tz';
import { addDate, atTime, calendarDate, dayKey } from './time';
import { prayers, type Prayer, type Settings } from './schema';

export type PrayerTimesMap = Record<Prayer | 'sunrise', string>;
export const cities = [
  ['Cairo', 'القاهرة', 30.0444, 31.2357], ['Alexandria', 'الإسكندرية', 31.2001, 29.9187], ['Borg El Arab', 'برج العرب', 30.8489, 29.6111], ['Giza', 'الجيزة', 30.0131, 31.2089],
  ['6th of October', 'السادس من أكتوبر', 29.9381, 30.914], ['Aswan', 'أسوان', 24.0889, 32.8998], ['Asyut', 'أسيوط', 27.1809, 31.1837], ['Banha', 'بنها', 30.4664, 31.1845], ['Beni Suef', 'بني سويف', 29.0661, 31.0994],
  ['Damanhur', 'دمنهور', 31.0341, 30.4682], ['Damietta', 'دمياط', 31.4175, 31.8144], ['El Arish', 'العريش', 31.1316, 33.7984], ['El Tor', 'الطور', 28.2417, 33.6236],
  ['Fayoum', 'الفيوم', 29.3084, 30.8428], ['Hurghada', 'الغردقة', 27.2579, 33.8116], ['Ismailia', 'الإسماعيلية', 30.5965, 32.2715], ['Kafr El Sheikh', 'كفر الشيخ', 31.1107, 30.9388],
  ['Kharga', 'الخارجة', 25.4390, 30.5586], ['Luxor', 'الأقصر', 25.6872, 32.6396], ['Mansoura', 'المنصورة', 31.0409, 31.3785], ['Marsa Matruh', 'مرسى مطروح', 31.3543, 27.2373], ['Minya', 'المنيا', 28.0871, 30.7618],
  ['Port Said', 'بورسعيد', 31.2653, 32.3019], ['Qena', 'قنا', 26.1551, 32.7160], ['Shebin El Kom', 'شبين الكوم', 30.5549, 31.0105], ['Sohag', 'سوهاج', 26.5591, 31.6957], ['Suez', 'السويس', 29.9737, 32.5263], ['Tanta', 'طنطا', 30.7865, 31.0004], ['Zagazig', 'الزقازيق', 30.5765, 31.5041]
] as const;

const monthCache=new Map<string,Map<string,PrayerTimesMap>>();
export function computePrayers(key: string,settings: Settings): PrayerTimesMap {
  const { location,prayer }=settings;
  const id=JSON.stringify([key.slice(0,7),location.latitude,location.longitude,location.timezone,prayer.method,prayer.madhab,prayer.highLatitude,prayer.offsets]);
  let month=monthCache.get(id);
  if (!month) {
    if (monthCache.size>=12) monthCache.delete(monthCache.keys().next().value!);
    month=new Map();
    monthCache.set(id,month);
  }
  const existing=month.get(key);
  if (existing) return existing;
  const result=calculatePrayers(key,settings);
  month.set(key,result);
  return result;
}
function calculatePrayers(key: string, settings: Settings): PrayerTimesMap {
  const { location, prayer } = settings;
  const civilDate = calendarDate(key);
  const options = CalculationMethod[prayer.method]();
  options.madhab = prayer.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  options.highLatitudeRule = HighLatitudeRule[prayer.highLatitude];
  options.adjustments = { ...options.adjustments, ...prayer.offsets };
  const times = new PrayerTimes(new Coordinates(location.latitude, location.longitude), civilDate, options);
  const result = (name: Prayer | 'sunrise') => {
    if (!Number.isFinite(+times[name])) return '';
    const localTime = formatInTimeZone(times[name], location.timezone, 'HH:mm');
    if (dayKey(times[name], location.timezone) === key) return times[name].toISOString();
    return atTime(key, localTime, location.timezone).toISOString();
  };
  return { fajr: result('fajr'), sunrise: result('sunrise'), dhuhr: result('dhuhr'), asr: result('asr'), maghrib: result('maghrib'), isha: result('isha') };
}
export function nextPrayer(now: Date, settings: Settings, timesFor = computePrayers) {
  const today = dayKey(now, settings.location.timezone);
  for (const key of [today, addDate(today, 1)]) {
    const times = timesFor(key, settings);
    for (const name of prayers) {
      const time = times[name];
      if (Date.parse(time) > +now) return { name, time, key };
    }
  }
  return null;
}
