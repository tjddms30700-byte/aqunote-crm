// v3.75.1: 수업 상품을 구분한다. 40분 STANDARD와 20분 STANDARD-HALF를 섞지 않는다.
export function lessonProductFamily(value: any): string | null {
  const text=String(value || "").replace(/\(\+?서비스\s*\d+회\)/g,"").replace(/\s/g,"").toUpperCase().replace(/[_–—]/g,"-");
  if (!text || ["수업","정규수업","일반수업","정규","수중재활","지상재활","LESSON","보강"].includes(text)) return null;
  if (/STANDARD-?HALF|스탠다드하프|스텐다드하프/.test(text)) return "standard-half";
  if (/STANDARD|스탠다드|스텐다드/.test(text)) return "standard";
  if (/^(기존)?\d+회권$/.test(text)) return "generic-session";
  if (/^월권(?:\(횟수[,·]?금액확인\))?$/.test(text)) return "monthly-session";
  // 같은 상품의 회차 묶음만 다른 경우는 한 계열로 본다. 상품명·하프/정규 구분은 유지한다.
  return text.replace(/\d+회권/g,"회권").toLowerCase();
}
export function lessonDurationMinutes(value: any): number | null {
  const family=lessonProductFamily(value);
  return family === "standard-half" ? 20 : family === "standard" ? 40 : null;
}
export function matchesLessonProduct(slot: any,membership: any,all: any[] = []): boolean {
  const linked=(all || []).find(m=>m.id === slot?.membership_id);
  const expected=lessonProductFamily(slot?.lesson_name) || lessonProductFamily(linked?.plan_name);
  const actual=lessonProductFamily(membership?.plan_name);
  return !expected || expected===actual;
}
