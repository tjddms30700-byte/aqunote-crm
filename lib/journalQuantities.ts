export type Quantity={value:number;kind:string;raw:string;key:string};
const native:Record<string,number>={'한':1,'하나':1,'두':2,'둘':2,'세':3,'셋':3,'네':4,'넷':4,'다섯':5,'여섯':6,'일곱':7,'여덟':8,'아홉':9,'열':10,'열한':11,'열두':12,'열세':13,'열네':14,'열다섯':15,'열여섯':16,'열일곱':17,'열여덟':18,'열아홉':19,'스무':20,'스물':20};
const sino:Record<string,number>={'영':0,'공':0,'일':1,'이':2,'삼':3,'사':4,'오':5,'육':6,'칠':7,'팔':8,'구':9,'십':10};
const unit='시간|차례|cm|mm|kg|초|분|회|번|개|단|점|도|살|세|명|m|g|%';
function number(text:string){return /^\d{1,3}(,\d{3})+$/.test(text)?Number(text.replace(/,/g,'')):Number(text.replace(',','.'));}
function normalize(value:number,u:string,raw:string):Quantity{let kind=u;if(['번','회','차례'].includes(u))kind='count';else if(['초','분','시간'].includes(u)){kind='seconds';value*=u==='시간'?3600:u==='분'?60:1;}else if(['cm','mm','m'].includes(u)){kind='mm';value*=u==='m'?1000:u==='cm'?10:1;}else if(['kg','g'].includes(u)){kind='grams';value*=u==='kg'?1000:1;}else if(['살','세'].includes(u))kind='age';value=Math.round(value*1000000)/1000000;return {value,kind,raw,key:kind+':'+value};}
export function quantities(text:string):Quantity[]{const out:{q:Quantity;start:number;end:number}[]=[];const add=(raw:string,n:number,u:string,index:number)=>{if(!Number.isFinite(n)||out.some(x=>index<x.end&&index+raw.length>x.start))return;out.push({q:normalize(n,u,raw),start:index,end:index+raw.length});};
 const re=new RegExp('(?<![0-9.])([+-]?\\d+(?:[.,]\\d+)*)\\s*('+unit+')(?![A-Za-z])','g');for(const m of text.normalize('NFC').matchAll(re))add(m[0],number(m[1]),m[2],m.index||0);
 const words=Object.keys(native).sort((a,b)=>b.length-a.length).join('|');for(const m of text.matchAll(new RegExp('(?<![가-힣])('+words+')\\s*(차례|번|회|개|단(?!계)|점|살|명)','g')))add(m[0],native[m[1]],m[2],m.index||0);
 // Sino-Korean readings require whitespace: bare '구분' is a word, not nine minutes.
 for(const m of text.matchAll(new RegExp('(?<![가-힣])([영공일이삼사오육칠팔구십]+)\\s+('+unit+')(?![A-Za-z])','g'))){let value=0;if(m[1].includes('십')){const [t,o]=m[1].split('십');if(t.length>1||o.length>1)continue;value=(t?sino[t]:1)*10+(o?sino[o]:0);}else if(m[1].length===1)value=sino[m[1]];else continue;add(m[0],value,m[2],m.index||0);}
 return out.sort((a,b)=>a.start-b.start).map(x=>x.q);
}
export function plainNumbers(text:string):string[]{return (text.match(/[+-]?\d+(?:[.,]\d+)*/g)||[]).map(x=>String(number(x)));}
export function quantityWarnings(source:string,fact:string):string[]{const expected=quantities(source),keys=new Set(quantities(fact).map(x=>x.key));return expected.filter(x=>!keys.has(x.key)).map(x=>`원문 ${x.raw}를 생성문과 대조해주세요.`);}
