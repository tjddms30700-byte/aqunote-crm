export type LessonTrack='aqua'|'ground';
export function lessonTrack(value:unknown):LessonTrack{return ['ground','device','recovery','리커버리케어','지상재활'].includes(String(value||'').toLowerCase())?'ground':'aqua';}
