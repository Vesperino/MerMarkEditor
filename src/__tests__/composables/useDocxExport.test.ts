import { describe, it, expect } from 'vitest';
import { Paragraph } from 'docx';
import { convertElementToDocxItems } from '../../composables/useDocxExport';

describe('convertElementToDocxItems', () => {
  it('converts <p> to Paragraph', () => {
    const el = document.createElement('p');
    el.textContent = 'Hello world';
    const items = convertElementToDocxItems(el);
    expect(items.length).toBe(1);
    expect(items[0]).toBeInstanceOf(Paragraph);
  });

  it('converts <h1> to Paragraph', () => {
    const el = document.createElement('h1');
    el.textContent = 'My Title';
    const items = convertElementToDocxItems(el);
    expect(items.length).toBe(1);
    expect(items[0]).toBeInstanceOf(Paragraph);
  });

  it('converts <h2> to Paragraph', () => {
    const el = document.createElement('h2');
    el.textContent = 'Section';
    const items = convertElementToDocxItems(el);
    expect(items.length).toBe(1);
    expect(items[0]).toBeInstanceOf(Paragraph);
  });

  it('converts <h3> to Paragraph', () => {
    const el = document.createElement('h3');
    el.textContent = 'Sub';
    const items = convertElementToDocxItems(el);
    expect(items.length).toBe(1);
    expect(items[0]).toBeInstanceOf(Paragraph);
  });

  it('converts <ul><li> to bullet paragraphs', () => {
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.textContent = 'Item one';
    ul.appendChild(li);
    const items = convertElementToDocxItems(ul);
    expect(items.length).toBe(1);
    expect(items[0]).toBeInstanceOf(Paragraph);
  });

  it('converts <ol><li> to numbered paragraphs', () => {
    const ol = document.createElement('ol');
    const li = document.createElement('li');
    li.textContent = 'Step one';
    ol.appendChild(li);
    const items = convertElementToDocxItems(ol);
    expect(items.length).toBe(1);
    expect(items[0]).toBeInstanceOf(Paragraph);
  });

  it('returns array for unknown/container div', () => {
    const div = document.createElement('div');
    const items = convertElementToDocxItems(div);
    expect(Array.isArray(items)).toBe(true);
  });

  it('converts <blockquote> to Paragraph', () => {
    const bq = document.createElement('blockquote');
    bq.textContent = 'A quote';
    const items = convertElementToDocxItems(bq);
    expect(items.length).toBe(1);
    expect(items[0]).toBeInstanceOf(Paragraph);
  });

  it('converts <hr> to Paragraph', () => {
    const hr = document.createElement('hr');
    const items = convertElementToDocxItems(hr);
    expect(items.length).toBe(1);
    expect(items[0]).toBeInstanceOf(Paragraph);
  });
});
