/**
 * Money — the ONLY sanctioned way to represent or compute a monetary amount in VAYRO.
 *
 * Rules enforced by construction:
 *  - Internally backed by `bigint` minor units (e.g. cents, or an asset's smallest unit).
 *  - Never constructed from a raw JS `number` fraction — only from bigint, integer string,
 *    or another Money of the SAME asset decimals.
 *  - No implicit float math anywhere. Percentage fees are computed via basis-points integer
 *    math (see FeeCalculator), never `amount * 0.05`.
 *
 * Any module that needs to add/subtract/compare amounts MUST go through this class or
 * MoneyMath — direct bigint/number arithmetic on amounts outside this file is a code-review
 * blocker.
 */
export class Money {
  private constructor(
    private readonly minorUnits: bigint,
    public readonly decimals: number,
  ) {
    if (decimals < 0 || decimals > 18) {
      throw new Error('Money: decimals out of supported range (0-18)');
    }
  }

  static fromMinorUnits(minorUnits: bigint, decimals: number): Money {
    return new Money(minorUnits, decimals);
  }

  /** Parses a decimal string like "125.50" into minor units for the given precision. Throws on invalid input. */
  static fromDecimalString(value: string, decimals: number): Money {
    if (!/^-?\d+(\.\d+)?$/.test(value)) {
      throw new Error(`Money: invalid decimal string "${value}"`);
    }
    const negative = value.startsWith('-');
    const clean = negative ? value.slice(1) : value;
    const [whole, frac = ''] = clean.split('.');
    if (frac.length > decimals) {
      throw new Error(`Money: value "${value}" has more precision than ${decimals} decimals`);
    }
    const paddedFrac = frac.padEnd(decimals, '0');
    const minor = BigInt(whole + paddedFrac || '0');
    return new Money(negative ? -minor : minor, decimals);
  }

  static zero(decimals: number): Money {
    return new Money(0n, decimals);
  }

  toMinorUnits(): bigint {
    return this.minorUnits;
  }

  /** Human-readable decimal representation, e.g. for API responses / receipts. */
  toDecimalString(): string {
    const negative = this.minorUnits < 0n;
    const abs = negative ? -this.minorUnits : this.minorUnits;
    const str = abs.toString().padStart(this.decimals + 1, '0');
    const whole = str.slice(0, str.length - this.decimals) || '0';
    const frac = this.decimals > 0 ? '.' + str.slice(str.length - this.decimals) : '';
    return (negative ? '-' : '') + whole + frac;
  }

  private assertSameScale(other: Money) {
    if (other.decimals !== this.decimals) {
      throw new Error('Money: cannot operate on amounts with different decimal precision');
    }
  }

  add(other: Money): Money {
    this.assertSameScale(other);
    return new Money(this.minorUnits + other.minorUnits, this.decimals);
  }

  subtract(other: Money): Money {
    this.assertSameScale(other);
    return new Money(this.minorUnits - other.minorUnits, this.decimals);
  }

  isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  greaterThanOrEqual(other: Money): boolean {
    this.assertSameScale(other);
    return this.minorUnits >= other.minorUnits;
  }

  lessThan(other: Money): boolean {
    this.assertSameScale(other);
    return this.minorUnits < other.minorUnits;
  }
}

/**
 * MoneyMath — fee/percentage helpers using integer basis-point math.
 * 1 basis point = 0.01%. 10000 bps = 100%.
 */
export class MoneyMath {
  /** Computes `amount * bps / 10000`, rounding down (floor) toward zero — never a float multiply. */
  static applyBasisPoints(amount: Money, bps: number): Money {
    if (!Number.isInteger(bps) || bps < 0) {
      throw new Error('MoneyMath: bps must be a non-negative integer');
    }
    const minor = amount.toMinorUnits();
    const result = (minor * BigInt(bps)) / 10000n;
    return Money.fromMinorUnits(result, amount.decimals);
  }

  static clamp(amount: Money, min: Money, max: Money): Money {
    if (amount.lessThan(min)) return min;
    if (max.lessThan(amount)) return max;
    return amount;
  }
}
