import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

export const formatStatusTime = (at: number, timezone = 'Asia/Shanghai', format = 'YYYY-MM-DD HH:mm') =>
  dayjs(at).tz(timezone).format(format);
