import { expect, it } from 'vitest';
import { encodeGbkQuery } from './encoding';
import { providerSearch } from './providerSearch';
import { books } from '../../data/books';
it('encodes Chinese words with the bytes accepted by Dangdang search',()=>{
 expect(encodeGbkQuery('边城 沈从文')).toBe('%B1%DF%B3%C7%20%C9%F2%B4%D3%CE%C4');
 expect(encodeGbkQuery('机器学习')).toBe('%BB%FA%C6%F7%D1%A7%CF%B0');
 expect(encodeGbkQuery('A&B + 50%')).toBe('A%26B%20%2B%2050%25');
});
it('keeps UTF-8 platforms intact while using GBK only for Dangdang',()=>{
 const book={...books[0],title:'边城',author:'沈从文'};
 const links=providerSearch(book);
 expect(links.find(x=>x.provider==='当当')!.url).toContain('key=%B1%DF%B3%C7%20%C9%F2%B4%D3%CE%C4');
 for(const provider of ['京东','微信读书','Google Books','Open Library']) {
  const url=new URL(links.find(x=>x.provider===provider)!.url);
  expect(url.searchParams.get('keyword')??url.searchParams.get('q')).toBe('边城 沈从文');
 }
});
it('does not turn unsupported characters into a corrupted keyword',()=>{
 expect(encodeGbkQuery('𠮷')).toBeNull();
 expect(providerSearch({...books[0],title:'边城',author:'𠮷'}).find(x=>x.provider==='当当')!.url).toContain('key=%B1%DF%B3%C7&');
 expect(providerSearch({...books[0],title:'𠮷',author:'作者'}).find(x=>x.provider==='当当')!.url).toBe('https://www.dangdang.com/');
});
