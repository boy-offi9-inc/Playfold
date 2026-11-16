import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, isMessage, parseTrack } from '../src/protocol';

describe('isMessage', () => {
  it('accepts well-formed messages of the current version', () => {
    expect(isMessage({ playfold: PROTOCOL_VERSION, kind: 'event', name: 'ready' })).toBe(true);
    expect(isMessage({ playfold: PROTOCOL_VERSION, kind: 'command', id: '1', name: 'play' })).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage('x')).toBe(false);
    expect(isMessage({})).toBe(false);
    expect(isMessage({ playfold: 999, kind: 'event' })).toBe(false);
    expect(isMessage({ playfold: PROTOCOL_VERSION, kind: 'nope' })).toBe(false);
  });
});

describe('parseTrack', () => {
  it('accepts a bare src', () => {
    expect(parseTrack({ src: 'https://a.test/x.mp3' })).toEqual({ src: 'https://a.test/x.mp3' });
  });
  it('keeps every known field', () => {
    const track = {
      src: 'https://a.test/x.mp3',
      title: 'Song',
      subtitle: 'Artist',
      eyebrow: 'Label',
      poster: 'https://a.test/c.jpg',
      type: 'audio' as const,
      autoplay: true,
    };
    expect(parseTrack(track)).toEqual(track);
  });
  it('drops anything it does not know', () => {
    const parsed = parseTrack({ src: 'https://a.test/x.mp3', onload: 'alert(1)', extra: { deep: true } });
    expect(parsed).toEqual({ src: 'https://a.test/x.mp3' });
  });
  it('drops an empty poster', () => {
    expect(parseTrack({ src: 'x', poster: '' })).toEqual({ src: 'x' });
  });
  it('rejects anything that is not a track object', () => {
    expect(() => parseTrack(null)).toThrow(/track object/);
    expect(() => parseTrack('x')).toThrow(/track object/);
    expect(() => parseTrack([])).toThrow(/track object/);
    expect(() => parseTrack(undefined)).toThrow(/track object/);
  });
  it('requires a non-empty src', () => {
    expect(() => parseTrack({})).toThrow(/src is required/);
    expect(() => parseTrack({ src: '' })).toThrow(/src is required/);
    expect(() => parseTrack({ src: 5 })).toThrow(/src must be a string/);
  });
  it('checks the types of the other fields', () => {
    expect(() => parseTrack({ src: 'x', title: 5 })).toThrow(/title must be a string/);
    expect(() => parseTrack({ src: 'x', type: 'image' })).toThrow(/type must be/);
    expect(() => parseTrack({ src: 'x', autoplay: 'yes' })).toThrow(/autoplay must be/);
  });
  it('rejects values that are too long', () => {
    expect(() => parseTrack({ src: 'x'.repeat(5000) })).toThrow(/src is longer/);
    expect(() => parseTrack({ src: 'x', title: 'x'.repeat(501) })).toThrow(/title is longer/);
  });
});
