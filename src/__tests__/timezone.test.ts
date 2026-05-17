import { describe, it, expect } from 'vitest';
import {
  getTimezoneOffsetSeconds,
  getTimezoneOffsetForTimestamp,
  utcToLocal,
  getTimezoneLabel,
  getTimezoneName,
  getTimezoneDisplay,
} from '../lib/timezone';

describe('Timezone Utilities', () => {
  describe('getTimezoneOffsetSeconds', () => {
    it('should return a number', () => {
      const offset = getTimezoneOffsetSeconds();
      expect(typeof offset).toBe('number');
    });

    it('should be a multiple of 60 or -0 (whole minutes)', () => {
      const offset = getTimezoneOffsetSeconds();
      // -0 is a valid result for UTC timezone (0 with negative sign from -0*60)
      expect(Math.abs(offset % 60)).toBe(0);
    });

    it('should return 0 for UTC timezone', () => {
      const original = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = () => 0;
      // -0 * 60 = -0, which is equivalent to 0
      expect(Math.abs(getTimezoneOffsetSeconds())).toBe(0);
      Date.prototype.getTimezoneOffset = original;
    });

    it('should return negative offset for UTC+5 (ahead of UTC)', () => {
      const original = Date.prototype.getTimezoneOffset;
      // UTC+5 → getTimezoneOffset returns -300 (negative = ahead of UTC)
      Date.prototype.getTimezoneOffset = () => -300;
      // -(-300) * 60 = 18000
      expect(getTimezoneOffsetSeconds()).toBe(18000);
      Date.prototype.getTimezoneOffset = original;
    });

    it('should return positive offset for UTC-5 (behind UTC, like Bogota)', () => {
      const original = Date.prototype.getTimezoneOffset;
      // UTC-5 → getTimezoneOffset returns +300 (positive = behind UTC)
      Date.prototype.getTimezoneOffset = () => 300;
      // -(300) * 60 = -18000
      expect(getTimezoneOffsetSeconds()).toBe(-18000);
      Date.prototype.getTimezoneOffset = original;
    });
  });

  describe('utcToLocal', () => {
    it('should return same timestamp for UTC timezone', () => {
      const original = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = () => 0;
      const ts = 1700000000;
      expect(utcToLocal(ts)).toBe(ts);
      Date.prototype.getTimezoneOffset = original;
    });

    it('should subtract 5 hours for UTC-5 (Bogota)', () => {
      const original = Date.prototype.getTimezoneOffset;
      // UTC-5: getTimezoneOffset = +300, offsetSeconds = -18000
      // utcToLocal = ts + (-18000) = ts - 18000
      Date.prototype.getTimezoneOffset = () => 300;
      const ts = 1700000000;
      expect(utcToLocal(ts)).toBe(ts - 18000);
      Date.prototype.getTimezoneOffset = original;
    });

    it('should add 1 hour for UTC+1 (Madrid)', () => {
      const original = Date.prototype.getTimezoneOffset;
      // UTC+1: getTimezoneOffset = -60, offsetSeconds = 3600
      // utcToLocal = ts + 3600
      Date.prototype.getTimezoneOffset = () => -60;
      const ts = 1700000000;
      expect(utcToLocal(ts)).toBe(ts + 3600);
      Date.prototype.getTimezoneOffset = original;
    });

    it('should handle half-hour offsets (India UTC+5:30)', () => {
      const original = Date.prototype.getTimezoneOffset;
      // UTC+5:30: getTimezoneOffset = -330, offsetSeconds = 19800
      Date.prototype.getTimezoneOffset = () => -330;
      const ts = 1700000000;
      expect(utcToLocal(ts)).toBe(ts + 19800);
      Date.prototype.getTimezoneOffset = original;
    });
  });

  describe('getTimezoneLabel', () => {
    it('should return a string starting with UTC', () => {
      const label = getTimezoneLabel();
      expect(label).toMatch(/^UTC[+-]\d/);
    });

    it('should return UTC+0 for UTC timezone', () => {
      const original = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = () => 0;
      expect(getTimezoneLabel()).toBe('UTC+0');
      Date.prototype.getTimezoneOffset = original;
    });

    it('should return UTC-5 for Bogota timezone', () => {
      const original = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = () => 300;
      expect(getTimezoneLabel()).toBe('UTC-5');
      Date.prototype.getTimezoneOffset = original;
    });

    it('should include minutes for half-hour offsets', () => {
      const original = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = () => -330; // UTC+5:30
      expect(getTimezoneLabel()).toBe('UTC+5:30');
      Date.prototype.getTimezoneOffset = original;
    });
  });

  describe('getTimezoneName', () => {
    it('should return a string', () => {
      const name = getTimezoneName();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });

    it('should contain a slash for IANA timezone names (e.g., America/Bogota)', () => {
      const name = getTimezoneName();
      // Most IANA timezone names contain a slash, except UTC
      if (name !== 'UTC') {
        expect(name).toContain('/');
      }
    });
  });

  describe('getTimezoneDisplay', () => {
    it('should return a string', () => {
      const display = getTimezoneDisplay();
      expect(typeof display).toBe('string');
      expect(display.length).toBeGreaterThan(0);
    });

    it('should contain the UTC offset', () => {
      const display = getTimezoneDisplay();
      // Should contain "UTC" followed by sign and number
      expect(display).toMatch(/UTC[+-]\d/);
    });
  });
});
