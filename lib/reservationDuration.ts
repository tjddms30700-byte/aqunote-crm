import {lessonDurationMinutes} from './lessonProduct';
import {lessonTrack} from './lessonTrack';
/** Actual occupied minutes, not the calendar grid's display interval. Aqua defaults to 40, ground to 30; the 70-minute grid interval is NOT a duration. Explicit saved or manually entered minutes always win. Never mutates saved history. */
export function reservationMinutes(slot:any,track='aqua'):number{
 for(const value of [slot?.duration_minutes,slot?.duration]){const n=Number(value);if(Number.isInteger(n)&&n>=10&&n<=180)return n;}
 const start=String(slot?.time_slot||'').slice(0,5),end=String(slot?.end_time||'').slice(0,5),clock=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
 if(clock.test(start)&&clock.test(end)){const minute=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));const n=minute(end)-minute(start);if(n>=10&&n<=180)return n;}
 const product=lessonDurationMinutes(slot?.lesson_name);if(product)return product;
 return lessonTrack(slot?.track||track)==='ground'?30:40;
}
