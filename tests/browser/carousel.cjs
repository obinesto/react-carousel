const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, firefox, webkit } = require('playwright');
const { createHarness } = require('./harness.cjs');
const { renderToString } = require('react-dom/server');
const React = require('react');
const { Carousel } = require('../../carousel/carousel.js');

const source = `
import React, {useEffect, StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {Carousel} from '../../carousel/carousel.mjs';
window.errors = [];
window.mounts = 0;
window.cleanups = 0;
const originalError = console.error;
console.error = (...args) => { window.errors.push(args.map(String).join(' ')); originalError(...args); };
function Item({item}) {
  useEffect(() => { window.mounts++; return () => { window.cleanups++; }; }, []);
  return React.createElement('div', {style:{width:item.width ? item.width+'px' : undefined}},
    React.createElement('label',{htmlFor:'input-'+item.id},item.id),
    React.createElement('input',{id:'input-'+item.id,defaultValue:item.id}),
    React.createElement('span',null,item.id));
}
let root;
window.renderVersion=0;
function Commit({version,children}) { useEffect(()=>{window.committed=version},[version]);return children; }
window.options = {};
window.items = Array.from({length:6},(_,i)=>({id:'item'+i}));
window.settled = [];
window.mount = (options = {}, items = window.items) => {
  window.options = options;
  window.items = items;
  const carousel = React.createElement(Carousel, {
    ...options, items, keyExtractor:item=>item.id,
    apiRef:api=>{window.api=api},
    onStateChange:state=>{window.state=state},
    onSettled:state=>window.settled.push(state),
    renderItem:item=>React.createElement(Item,{item}),
  });
  const content = React.createElement('div',{className:'fixture'},carousel);
  const app = React.createElement(StrictMode,null,React.createElement(Commit,{version:++window.renderVersion},content));
  if (!root && location.search.includes('hydrate')) root=hydrateRoot(document.getElementById('app'),app,{onRecoverableError:error=>window.errors.push(String(error))});
  else { if(!root) root=createRoot(document.getElementById('app')); root.render(app); }
};
window.mountPair = () => {
  window.pairApis=[];window.pairStates=[];
  root.render(React.createElement('div',{className:'fixture'},[0,1].map(instance=>React.createElement(Carousel,{
    key:instance,items:window.items,'aria-label':'Collection '+instance,
    apiRef:api=>{window.pairApis[instance]=api},onStateChange:state=>{window.pairStates[instance]=state},
    renderItem:(_,index)=>React.createElement('button',{id:'pair-'+instance+'-'+index},'Item '+index)
  }))));
};
window.unmount = ()=> { root.unmount(); root=undefined; };
if (!location.search.includes('hydrate')) window.mount();
`;
let harness;
before(async () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ id: 'item' + i }));
  function ServerItem({ item }) {
    return React.createElement('div', null,
      React.createElement('label', { htmlFor: 'input-' + item.id }, item.id),
      React.createElement('input', { id: 'input-' + item.id, defaultValue: item.id }),
      React.createElement('span', null, item.id));
  }
  function Commit({ children }) { return children; }
  const markup = renderToString(React.createElement(React.StrictMode, null,
    React.createElement(Commit, null, React.createElement('div', { className: 'fixture' }, React.createElement(Carousel, {
      items, keyExtractor: item => item.id, renderItem: item => React.createElement(ServerItem, { item })
    })))));
  harness = await createHarness(source, 'carousel/carousel.css', markup);
});
after(async () => { await harness?.close(); });
const selected = async (page, index) => {
  await page.waitForFunction(index => window.committed === window.renderVersion && window.state?.selectedIndex === index && !window.state?.isScrolling, index).catch(async error => { console.log('selection diagnostic', index, await page.evaluate(() => ({ state: window.state, style: document.querySelector('.rc-root').getAttribute('style'), scroll: document.querySelector('.rc-viewport').scrollLeft }))); throw error; });
};
const invoke = async (page, method, ...args) => { await page.evaluate(({ method, args }) => window.api[method](...args), { method, args }); };
async function mount(page, options = {}, items) {
  await page.evaluate(({ options, items }) => window.mount(options, items), { options, items });
  await page.waitForFunction(() => window.committed === window.renderVersion && window.api && window.state && !window.state.isScrolling);
}

for (const engine of [chromium, firefox, webkit].filter(engine => !process.env.CAROUSEL_BROWSERS || process.env.CAROUSEL_BROWSERS.split(',').includes(engine.name()))) {
  test(`${engine.name()}: measured navigation, fractional sizing, groups, RTL, focus, resize, playback, and hydration`, { timeout: 120000 }, async t => {
    const browser = await engine.launch(engine === chromium && process.env.CAROUSEL_BROWSER_CHANNEL ? { channel: process.env.CAROUSEL_BROWSER_CHANNEL, headless: true } : { headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(8000);
      await page.goto(harness.url);
      await page.waitForFunction(() => window.api && window.state?.canNext);
      await t.test('single instances, fractional boundaries, finite and loop navigation', async () => {
        assert.equal(await page.locator('input').count(), 6);
        await mount(page, { loop: true, gap: 15.5, slidesPerView: 2.5 });
        await invoke(page, 'previous'); await selected(page, 5);
        await invoke(page, 'next'); await selected(page, 0);
        await invoke(page, 'next'); await selected(page, 1);
        const delta = await page.locator('.rc-viewport').evaluate(e => Math.abs(e.children[1].getBoundingClientRect().left - e.getBoundingClientRect().left));
        assert.ok(delta < 1, `fractional alignment ${delta}`);
        await page.evaluate(() => { window.api.next(); window.api.next(); window.api.previous(); });
        await selected(page, 2);
        await mount(page, { loop: false });
        await invoke(page, 'goTo', 99); await selected(page, 5);
        assert.equal(await page.getByRole('button', { name: 'Next slide', exact: true }).isDisabled(), true);
      });
      await t.test('variable widths and visible group steps', async () => {
        await mount(page, { slidesPerView: 'auto', slidesToScroll: 'page', gap: 15.5 }, [180.25, 230.75, 155.5, 290.25, 350.5].map((width, i) => ({ id: 'item' + i, width })));
        await invoke(page, 'goTo', 0); await selected(page, 0);
        await invoke(page, 'next'); await selected(page, 3);
        const state = await page.evaluate(() => window.state);
        assert.ok(state.visibleIndices.includes(3));
        await invoke(page, 'previous'); await selected(page, 0);
      });
      await t.test('center and end alignment use the actual slide edges', async () => {
        const values = [180.25, 230.75, 155.5, 290.25, 350.5].map((width, i) => ({ id: 'item' + i, width }));
        await mount(page, { slidesPerView: 'auto', align: 'center' }, values);
        await invoke(page, 'goTo', 2); await selected(page, 2);
        assert.ok(await page.locator('.rc-viewport').evaluate(view => {
          const slide = view.children[2].getBoundingClientRect(), bounds = view.getBoundingClientRect();
          return Math.abs((slide.left + slide.right - bounds.left - bounds.right) / 2) < 1;
        }));
        await mount(page, { slidesPerView: 'auto', align: 'end' }, values);
        await invoke(page, 'goTo', 3); await selected(page, 3);
        assert.ok(await page.locator('.rc-viewport').evaluate(view => Math.abs(view.children[3].getBoundingClientRect().right - view.getBoundingClientRect().right) < 1));
      });
      await t.test('responsive container, selection identity, and removal', async () => {
        const values = Array.from({ length: 6 }, (_, i) => ({ id: 'item' + i }));
        await mount(page, { breakpoints: { 500: { slidesPerView: 2 } }, loop: true }, values);
        await invoke(page, 'goTo', 3); await selected(page, 3);
        await page.addStyleTag({ content: '.fixture{width:420.25px}' });
        await page.waitForFunction(() => Math.abs(document.querySelector('.rc-slide').getBoundingClientRect().width - 420.25) < 1);
        await selected(page, 3);
        await page.evaluate(() => window.mount(window.options, [window.items[3], ...window.items.filter((_, i) => i !== 3)]));
        await selected(page, 0);
        await page.evaluate(() => window.mount(window.options, window.items.slice(1)));
        await selected(page, 0);
        await page.addStyleTag({ content: '.fixture{width:600.5px}' });
      });
      await t.test('equivalent rerender preserves backward navigation and field state', async () => {
        await mount(page, { loop: true });
        await invoke(page, 'goTo', 0); await selected(page, 0);
        await page.locator('input').first().fill('kept');
        await page.evaluate(() => { window.api.previous(); window.mount(window.options, [...window.items]); });
        await selected(page, (await page.evaluate(() => window.items.length)) - 1);
        await invoke(page, 'next'); await selected(page, 0);
        assert.equal(await page.locator('input').first().inputValue(), 'kept');
      });
      await t.test('RTL and keyboard navigation do not steal focus', async () => {
        await mount(page, { dir: 'rtl', loop: true }, Array.from({ length: 6 }, (_, i) => ({ id: 'item' + i })));
        await invoke(page, 'goTo', 0); await selected(page, 0);
        await page.locator('.rc-viewport').focus();
        await page.keyboard.press('ArrowLeft'); await selected(page, 1);
        assert.equal(await page.locator('.rc-viewport').evaluate(e => e === document.activeElement), true);
        assert.ok(await page.locator('.rc-viewport').evaluate(e => e.scrollLeft < 0));
        await page.keyboard.press('End'); await selected(page, 5);
      });
      await t.test('hidden initialization, delayed sizing, zoom, and insufficient content', async () => {
        await page.evaluate(() => window.unmount());
        await page.addStyleTag({ content: '.fixture{display:none}' });
        await mount(page, { startIndex: 2, slidesPerView: 'auto' }, [180.25, 230.75, 155.5, 290.25, 350.5].map((width, i) => ({ id: 'item' + i, width })));
        await page.addStyleTag({ content: '.fixture{display:block;zoom:1.1}' });
        await page.waitForFunction(() => document.querySelector('.rc-viewport').getBoundingClientRect().width > 0);
        await page.waitForFunction(() => window.state.selectedIndex === 2 && Math.abs(document.querySelectorAll('.rc-slide')[2].getBoundingClientRect().left - document.querySelector('.rc-viewport').getBoundingClientRect().left) < 1);
        await page.addStyleTag({ content: '.fixture{zoom:1}' });
        await invoke(page, 'goTo', 2); await selected(page, 2);
        await page.locator('.rc-slide > div').first().evaluate(e => e.style.width = '250.75px');
        await page.waitForFunction(() => !window.state.isScrolling && window.state.selectedIndex === 2 && Math.abs(document.querySelectorAll('.rc-slide')[2].getBoundingClientRect().left - document.querySelector('.rc-viewport').getBoundingClientRect().left) < 1);
        await mount(page, { loop: true }, [{ id: 'only' }]);
        assert.equal(await page.getByRole('button', { name: 'Next slide', exact: true }).isDisabled(), true);
        await mount(page, { loop: true, slidesPerView: 3 }, [{ id: 'one' }, { id: 'two' }]);
        assert.equal(await page.getByRole('button', { name: 'Next slide', exact: true }).isDisabled(), true);
        await mount(page, {}, []);
        assert.equal(await page.locator('.rc-slide').count(), 0);
      });
      await t.test('late image loading preserves the selected item', async () => {
        await mount(page, { slidesPerView: 'auto' }, Array.from({ length: 6 }, (_, i) => ({ id: 'item' + i })));
        await invoke(page, 'goTo', 2); await selected(page, 2);
        await page.locator('.rc-slide > div').first().evaluate(async element => {
          const image = new Image(); image.alt = 'Late image'; image.style.display = 'block';
          image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="30"></svg>');
          element.append(image); await image.decode();
        });
        await page.waitForFunction(() => window.state.selectedIndex === 2 && Math.abs(document.querySelectorAll('.rc-slide')[2].getBoundingClientRect().left - document.querySelector('.rc-viewport').getBoundingClientRect().left) < 1);
      });
      await t.test('offscreen fields are inert, visible field values survive wrapping', async () => {
        await mount(page, { loop: true }, Array.from({ length: 6 }, (_, i) => ({ id: 'item' + i })));
        await invoke(page, 'goTo', 0); await selected(page, 0);
        await page.locator('input').first().fill('retained');
        assert.equal(await page.locator('.rc-slide').last().evaluate(e => e.inert), true);
        await page.locator('input').last().evaluate(e => e.focus());
        assert.equal(await page.evaluate(() => document.activeElement.id), 'input-item0');
        await invoke(page, 'previous'); await selected(page, 5);
        await invoke(page, 'next'); await selected(page, 0);
        assert.equal(await page.locator('input').first().inputValue(), 'retained');
        assert.equal(await page.locator('#input-item0').count(), 1);
      });
      await t.test('reduced motion, hover, focus, and explicit playback', async () => {
        await mount(page, { loop: true, autoplay: { interval: 250 } });
        assert.equal(await page.evaluate(() => window.state.playback), 'paused');
        assert.equal(await page.getByRole('button', { name: 'Start slide rotation' }).isDisabled(), true);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.waitForFunction(() => !document.querySelector('.rc-playback').disabled);
        await page.mouse.move(950, 650);
        await page.evaluate(() => document.activeElement?.blur());
        await invoke(page, 'play');
        await page.waitForFunction(() => window.state.playback === 'playing');
        await page.locator('.rc-root').hover();
        await page.waitForFunction(() => window.state.playback === 'suspended');
        await page.mouse.move(950, 650);
        await page.locator('button').first().focus();
        await page.waitForFunction(() => window.state.playback === 'paused');
        await page.locator('button').first().evaluate(e => e.blur());
        assert.equal(await page.evaluate(() => window.state.playback), 'paused');
        await invoke(page, 'play');
        const before = await page.evaluate(() => window.state.selectedIndex);
        await page.waitForFunction(before => window.state.selectedIndex !== before, before);
        await invoke(page, 'pause');
        await page.emulateMedia({ reducedMotion: 'reduce' });
      });
      await t.test('pauseOnHover can be disabled and changed while hovered', async () => {
        await mount(page, { loop: true, autoplay: { interval: 250 }, pauseOnHover: false });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.waitForFunction(() => !document.querySelector('.rc-playback').disabled);
        await page.evaluate(() => document.activeElement?.blur());
        await invoke(page, 'play');
        await page.locator('.rc-root').hover();
        const initial = await page.evaluate(() => window.state.selectedIndex);
        await page.waitForFunction(index => window.state.selectedIndex !== index, initial);
        await page.evaluate(() => window.mount({ ...window.options, pauseOnHover: true }));
        await page.waitForFunction(() => window.state.playback === 'suspended');
        const stopped = await page.evaluate(() => window.state.selectedIndex);
        await page.evaluate(() => window.mount({ ...window.options, pauseOnHover: false }));
        await page.waitForFunction(index => window.state.selectedIndex !== index, stopped);
        await invoke(page, 'pause');
        await page.waitForFunction(() => window.state.playback === 'paused');
        await page.mouse.move(950, 650);
        assert.equal(await page.evaluate(() => window.state.playback), 'paused');
        await page.emulateMedia({ reducedMotion: 'reduce' });
      });
      await t.test('wheel input and interrupted smooth scroll settle', async () => {
        await mount(page, { loop: true });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await invoke(page, 'goTo', 0); await selected(page, 0);
        await page.evaluate(() => { window.api.next(); window.api.next(); window.api.previous(); });
        await selected(page, 1);
        await page.locator('.rc-viewport').hover();
        await page.mouse.wheel(400, 0);
        await page.waitForFunction(() => !window.state.isScrolling);
        assert.ok((await page.evaluate(() => window.settled)).length > 0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
      });
      await t.test('independent instances and unique control relationships', async () => {
        await page.evaluate(() => window.mountPair());
        await page.waitForFunction(() => window.pairApis?.filter(Boolean).length === 2 && window.pairStates?.filter(Boolean).length === 2 && window.pairStates.every(state => state.canNext));
        const ids = await page.locator('.rc-viewport').evaluateAll(nodes => nodes.map(node => node.id));
        assert.equal(new Set(ids).size, 2);
        await page.evaluate(() => window.pairApis[0].next());
        await page.waitForFunction(() => window.pairStates[0].selectedIndex === 1 && !window.pairStates[0].isScrolling);
        assert.equal(await page.evaluate(() => window.pairStates[1].selectedIndex), 0);
      });
      await t.test('unmount cleans mounted slides', async () => {
        await page.evaluate(() => window.unmount());
        assert.equal(await page.evaluate(() => window.mounts - window.cleanups), 0);
        assert.deepEqual(await page.evaluate(() => window.errors), []);
      });
      await page.close();
      await t.test('server rendering hydrates without recovery or duplicate content', async () => {
        const hydrated = await browser.newPage({ reducedMotion: 'reduce' });
        await hydrated.goto(harness.url + '/?hydrate');
        assert.equal(await hydrated.locator('input').count(), 6);
        await hydrated.evaluate(() => window.mount());
        await hydrated.waitForFunction(() => window.state?.canNext);
        await invoke(hydrated, 'next'); await selected(hydrated, 1);
        assert.deepEqual(await hydrated.evaluate(() => window.errors), []);
        await hydrated.close();
      });
      if (engine === chromium) await t.test('native touch gesture scrolls and settles', async () => {
        const touch = await browser.newPage({ hasTouch: true, isMobile: true, viewport: { width: 800, height: 600 }, reducedMotion: 'reduce' });
        await touch.goto(harness.url);
        await touch.waitForFunction(() => window.state?.canNext);
        const cdp = await touch.context().newCDPSession(touch);
        const box = await touch.locator('.rc-viewport').boundingBox();
        const y = box.y + box.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y }] });
        for (let x = 480;x >= 100;x -= 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await touch.waitForFunction(() => document.querySelector('.rc-viewport').scrollLeft > 100 && !window.state.isScrolling);
        assert.ok(await touch.evaluate(() => window.state.visibleIndices.some(index => index > 0)));
        await touch.close();
      });
    } finally { await browser.close(); }
  });
}
