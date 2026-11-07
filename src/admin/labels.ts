import { formatStudioDate, formatStudioTime } from '../lib/time';
export const when = (date: Date) => `${formatStudioDate(date)} ${formatStudioTime(date)} МСК`;
export const statusText = {
  active: 'Активна',
  cancelled: 'Отменена',
  attended: 'Пришла',
  no_show: 'Не пришла',
};
export const actorText = {
  client_site: 'Клиент на сайте',
  client_bot: 'Клиент в боте',
  manager: 'Менеджер',
  system: 'Система',
};
export const reasonText = {
  remind: 'Напомнить о визите',
  changed: 'Сообщить об изменении',
  conflict: 'Конфликт с расписанием',
};
