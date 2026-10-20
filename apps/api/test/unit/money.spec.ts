import { Money, MoneyMath } from '../../src/common/money/money';
import { FeeCalculator } from '../../src/common/money/fee-calculator';

describe('Money', () => {
  it('parses and re-renders a decimal string exactly (no float drift)', () => {
    const m = Money.fromDecimalString('1250.75', 2);
    expect(m.toMinorUnits()).toBe(125075n);
    expect(m.toDecimalString()).toBe('1250.75');
  });

  it('rejects more precision than the asset supports', () => {
    expect(() => Money.fromDecimalString('1.123', 2)).toThrow();
  });

  it('refuses to add amounts of different decimal precision', () => {
    const a = Money.fromDecimalString('10', 2);
    const b = Money.fromDecimalString('10', 6);
    expect(() => a.add(b)).toThrow();
  });

  it('add/subtract are exact for values that would lose precision as floats', () => {
    const a = Money.fromDecimalString('0.1', 2);
    const b = Money.fromDecimalString('0.2', 2);
    expect(a.add(b).toDecimalString()).toBe('0.30'); // 0.1+0.2 !== 0.3 in JS float
  });
});

describe('MoneyMath.applyBasisPoints (fee %)', () => {
  it('computes 5% fee via integer bps math, floors correctly', () => {
    const amount = Money.fromDecimalString('100.00', 2);
    const fee = MoneyMath.applyBasisPoints(amount, 500); // 500 bps = 5%
    expect(fee.toDecimalString()).toBe('5.00');
  });

  it('floors instead of rounding up on fractional minor units', () => {
    const amount = Money.fromDecimalString('0.03', 2); // 3 minor units
    const fee = MoneyMath.applyBasisPoints(amount, 500); // 5% of 3 = 0.15 -> floor to 0
    expect(fee.toMinorUnits()).toBe(0n);
  });
});

describe('FeeCalculator', () => {
  it('clamps a percentage fee to the configured min/max', () => {
    const amount = Money.fromDecimalString('1.00', 2);
    const fee = FeeCalculator.calculate(amount, {
      type: 'PERCENTAGE',
      value: 500n, // 5% of 1.00 = 0.05, below min
      minFee: Money.fromDecimalString('0.50', 2),
      maxFee: Money.fromDecimalString('10.00', 2),
    });
    expect(fee.toDecimalString()).toBe('0.50');
  });
});
