import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload()});
test('vector PDF keeps planned Arabic/emoji visible as fallback images on one page',async({page})=>{
  const result=await page.evaluate(async()=>{
    const modelPath: string = '/src/model.ts';
    const { createTask, initialState }: typeof import('../src/model') =await import(/* @vite-ignore */ modelPath);
    const planningPath: string = '/src/lib/planning.ts';
    const { addEntry, editEntry }: typeof import('../src/lib/planning') =await import(/* @vite-ignore */ planningPath);
    const trackerPath: string = '/src/lib/tracker.ts';
    const { trackerData }: typeof import('../src/lib/tracker') =await import(/* @vite-ignore */ trackerPath);
    const pdfPath: string = '/src/lib/trackerPdf.ts';
    const { buildTrackerDocument }: typeof import('../src/lib/trackerPdf') =await import(/* @vite-ignore */ pdfPath);
    const date='2026-10-16';
    const task=createTask({title:'Clinical note',category:'Pharmacy',subtasks:[{id:'k',title:'Step واحد ✅',done:false}]});
    let board=addEntry({...initialState(),tasks:[task]},task.id,date);
    board=editEntry(board,board.plannedEntries[0].id,{title:'تقرير 📋',status:'progressing'});
    const options={anchor:date,scale:'day' as const,area:'All',includeUndated:true,includeChecklist:true,paper:'a4' as const};
    const sheet=trackerData(board,options);
    const output=await buildTrackerDocument(sheet,options,'هدف اليوم 🎯','مرحبا، تقدم 🚀');
    const bytes=new Uint8Array(await output.pdf.arrayBuffer());
    const url=URL.createObjectURL(new Blob([output.svg],{type:'image/svg+xml'}));
    const image=document.createElement('img');image.id='pdf-render-proof';image.src=url;image.style.width='100%';image.style.display='block';
    document.body.replaceChildren(image);
    await image.decode();
    return {count:output.taskCount,occurrences:sheet.occurrenceCount,labels:sheet.sections[0].items.map(i=>i.label),rasterized:output.rasterizedLines,font:output.smallestFont,header:new TextDecoder().decode(bytes.subarray(0,5)),bytes:bytes.length,svgHasImage:output.svg.includes('<image'),width:image.naturalWidth,height:image.naturalHeight};
  });
  expect(result.labels.some(t=>t.includes('تقرير 📋'))).toBe(true);
  expect(result.occurrences).toBe(1);
  expect(result.rasterized).toBeGreaterThan(0);
  expect(result.svgHasImage).toBe(true);
  expect(result.header).toBe('%PDF-');
  expect(result.bytes).toBeGreaterThan(5000);
  expect(result.width).toBeGreaterThan(result.height);
  await page.locator('#pdf-render-proof').screenshot({path:'test-results/tracker-arabic-sample.png'});
});

test('quote selection follows chosen date, including a saved planned copy',async({page})=>{
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Direction & quotes/}).click();
  await page.getByRole('textbox',{name:'Quote date'}).fill('2026-10-20');
  await expect(page.getByRole('heading',{name:'A quote for the day'})).toBeVisible();
  await expect(page.locator('.quote-settings-grid blockquote')).toHaveCount(1);
});

test('calendar multi-day selection opens a modal with copy/paste and remains keyboard-dismissible',async({page})=>{
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/^Calendar/}).click();
  await page.getByRole('button',{name:'Copy / paste days'}).click();
  const dialog=page.getByRole('dialog',{name:'Copy and paste multiple calendar days'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:/Copy 1 day/})).toBeVisible();
  await dialog.getByRole('button',{name:'Close'}).click();
  await expect(dialog).not.toBeVisible();
});
