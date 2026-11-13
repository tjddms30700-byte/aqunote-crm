// DOM-only report pagination. No source text is shortened and no clinical data is written.
export type ReportPagination={host:HTMLDivElement;pages:HTMLElement[];dispose:()=>void};
let exportSequence=0;
export function paginateGrowthReport(first:HTMLElement,second:HTMLElement):ReportPagination{
 const host=document.createElement('div');host.className='report-v3870 report-v3915 report-pagination-host';host.setAttribute('aria-hidden','true');
 const deck=document.createElement('div');deck.className='growth-report-print';host.appendChild(deck);document.body.appendChild(host);
 const pages:HTMLElement[]=[];const prefix=`gr-export-${++exportSequence}-`;
 const cleanup=()=>host.remove();
 const fits=(page:HTMLElement)=>page.scrollHeight<=page.clientHeight+1&&page.scrollWidth<=page.clientWidth+1;
 const duplicate=(node:HTMLElement)=>{const clone=node.cloneNode(true) as HTMLElement;clone.querySelectorAll('select,button,.print-hide').forEach(x=>x.remove());return clone;};
 try{
  const firstPage=duplicate(first);firstPage.classList.add('report-generated-page');deck.appendChild(firstPage);pages.push(firstPage);
  if(!fits(firstPage))throw new Error('첫 페이지의 차트·요약 배치를 확인해주세요. 내용을 잘라서 내보내지 않았습니다.');
  const header=second.querySelector<HTMLElement>(':scope > header'),footer=second.querySelector<HTMLElement>(':scope > footer');
  if(!header||!footer)throw new Error('보고서 머리말·꼬리말을 확인하지 못했습니다.');
  let page:HTMLElement,bodyItems=0;
  const nextPage=()=>{page=document.createElement('section');page.className='report-sheet report-page-two report-generated-page';page.appendChild(duplicate(header));page.appendChild(duplicate(footer));deck.appendChild(page);pages.push(page);bodyItems=0;};
  const append=(node:HTMLElement)=>page.insertBefore(node,page.lastElementChild);
  nextPage();
  for(const original of Array.from(second.children) as HTMLElement[]){
   if(original===header||original===footer)continue;
   const prose=original.querySelector<HTMLElement>('.report-prose');
   if(!prose){let block=duplicate(original);append(block);if(!fits(page!)){block.remove();if(bodyItems)nextPage();append(block);if(!fits(page!))throw new Error('차트 또는 서명 영역이 한 페이지보다 큽니다. 잘라서 저장하지 않았습니다.');}bodyItems++;continue;}
   let remaining=Array.from(prose.textContent||''),part=0;
   if(!remaining.length)continue;
   while(remaining.length){
    const block=duplicate(original);const target=block.querySelector<HTMLElement>('.report-prose')!;target.textContent='';
    target.dataset.reportFragment=original.classList.contains('report-home')?'home':'analysis';
    if(part){const title=block.querySelector('h2');if(title)title.textContent=(original.querySelector('h2')?.textContent||'보고서')+' · 계속';}
    append(block);target.textContent=remaining.join('');
    if(fits(page!)){remaining=[];bodyItems++;break;}
    let lo=0,hi=remaining.length;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);target.textContent=remaining.slice(0,mid).join('');if(fits(page!))lo=mid;else hi=mid-1;}
    if(lo<1){block.remove();if(!bodyItems)throw new Error('본문 한 줄을 배치할 공간이 없습니다. 인쇄 배율을 확인해주세요.');nextPage();continue;}
    // Prefer a nearby paragraph/sentence boundary, retaining every whitespace character.
    let cut=lo;const prefixText=remaining.slice(0,lo).join('');const floor=Math.max(0,prefixText.length-160);
    const boundary=Math.max(prefixText.lastIndexOf('\n\n'),prefixText.lastIndexOf('\n'),prefixText.lastIndexOf('. '));
    if(boundary>=floor&&boundary>0){const end=boundary+(prefixText.startsWith('\n\n',boundary)?2:prefixText[boundary]==='\n'?1:2);const count=Array.from(prefixText.slice(0,end)).length;if(count>0&&count<=lo)cut=count;}
    target.textContent=remaining.slice(0,cut).join('');remaining=remaining.slice(cut);bodyItems++;part++;nextPage();
   }
  }
  // All generated text must reconstruct the source exactly before output is permitted.
  for(const [selector,kind]of [['.report-analysis .report-prose','analysis'],['.report-home .report-prose','home']] as const){const source=second.querySelector(selector)?.textContent||'';const reconstructed=Array.from(deck.querySelectorAll(`[data-report-fragment="${kind}"]`)).map(x=>x.textContent||'').join('');if(source!==reconstructed)throw new Error('출력 본문 일치 검사에 실패했습니다. 내용을 잘라서 저장하지 않았습니다.');}
  pages.forEach((p,i)=>{const counter=p.querySelector('footer b');if(counter)counter.textContent=`${i+1} / ${pages.length}`;p.dataset.page=String(i+1);if(!fits(p))throw new Error('자동 분할한 페이지가 출력 영역을 벗어났습니다.');});
  // Unique SVG gradient/clip-path IDs when the original screen and export clone coexist.
  const replacements=new Map<string,string>();deck.querySelectorAll('[id]').forEach(el=>{const old=el.id;replacements.set(old,prefix+old);el.id=prefix+old;});
  deck.querySelectorAll('*').forEach(el=>{for(const attr of Array.from(el.attributes)){let value=attr.value;for(const [old,next]of replacements){value=value.split(`url(#${old})`).join(`url(#${next})`);if(value==='#'+old)value='#'+next;}if(value!==attr.value)el.setAttribute(attr.name,value);}});
  return {host,pages,dispose:cleanup};
 }catch(error){cleanup();throw error;}
}
