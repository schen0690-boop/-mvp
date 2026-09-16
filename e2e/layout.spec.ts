import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
for (const [width,height] of [[390,844],[1366,768],[2560,1080]] as const) {
  test(`真实布局：${width}x${height}，区域访问、键盘与独立滚动`,async ({page}) => {
    await page.setViewportSize({width,height});
    const prefix = `布局${width}-${randomUUID().slice(0,8)}`;
    const topic = `${prefix}：`+'人工智能走进课堂时，教师应该如何保留自主判断？'.repeat(15);
    for (let index=0;index<18;index++) {
      const result = await page.request.post('/api/discussions',{data:{topic:index===0?topic:`${prefix}议题${index}`,requestId:randomUUID()}});
      expect(result.status()).toBe(201);
    }
    await page.goto('/');
    await expect(page.getByRole('button',{name:'创建草稿',exact:true})).toBeInViewport({ratio:1});
    await page.getByLabel('讨论话题',{exact:true}).focus();
    await page.keyboard.type('keyboard'); await page.keyboard.press('Tab');
    await expect(page.getByLabel('专家人数',{exact:true})).toBeFocused();
    if(width<900) await page.getByRole('navigation',{name:'区域选择'}).getByRole('button',{name:'讨论列表'}).click();
    await page.getByRole('button',{name:'全部讨论',exact:true}).click();
    const list=page.getByRole('region',{name:'讨论列表'});
    await expect(list.getByRole('button',{name:topic,exact:true})).toBeAttached();
    const scroll=list.locator('.pane-scroll');
    const before=await page.locator('body').evaluate(el=>({width:el.scrollWidth,height:el.scrollHeight}));
    expect(before.width).toBeLessThanOrEqual(width); expect(before.height).toBeLessThanOrEqual(height);
    await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});
    expect(await scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    expect(await page.locator('.create-pane .pane-scroll').evaluate(el=>el.scrollTop)).toBe(0);
    await list.getByRole('button',{name:topic,exact:true}).click();
    const detail=page.getByRole('region',{name:'草稿详情'});
    await expect(detail.getByText(topic,{exact:true})).toBeVisible();
    const listPosition=width>=900 ? await scroll.evaluate(el=>el.scrollTop) : 0;
    await detail.locator('.pane-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await expect(detail.getByText('阵容尚未生成',{exact:true})).toBeVisible();
    if(width>=900) expect(await scroll.evaluate(el=>el.scrollTop)).toBe(listPosition);
    await detail.locator('.pane-scroll').evaluate(el=>{el.scrollTop=0;});
    mkdirSync('evidence/stage-5c/screenshots',{recursive:true});
    await page.screenshot({path:`evidence/stage-5c/screenshots/${width}x${height}-detail.png`});
    if(width<900) {
      const nav=page.getByRole('navigation',{name:'区域选择'});
      await nav.getByRole('button',{name:'新建讨论'}).click(); await expect(page.getByLabel('讨论话题',{exact:true})).toBeVisible();
      await page.screenshot({path:`evidence/stage-5c/screenshots/${width}x${height}-create.png`});
      await nav.getByRole('button',{name:'讨论列表'}).click(); await expect(list).toBeVisible();
      expect(await scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
    }
  });
}
