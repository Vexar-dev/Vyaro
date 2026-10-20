import { Money, MoneyMath } from './money';

export interface FeeRule {
  type: 'PERCENTAGE' | 'FIXED';
  /** basis points if PERCENTAGE, minor units if FIXED */
  value: bigint;
  minFee?: Money;
  maxFee?: Money;
}

/**
 * FeeCalculator — the single place fee amounts are derived. No module outside
 * this file may compute `amount * percentage` directly.
 */
export class FeeCalculator {
  static calculate(amount: Money, rule: FeeRule): Money {
    let fee: Money;
    if (rule.type === 'PERCENTAGE') {
      fee = MoneyMath.applyBasisPoints(amount, Number(rule.value));
    } else {
      fee = Money.fromMinorUnits(rule.value, amount.decimals);
    }

    if (rule.minFee && rule.maxFee) {
      fee = MoneyMath.clamp(fee, rule.minFee, rule.maxFee);
    } else if (rule.minFee && fee.lessThan(rule.minFee)) {
      fee = rule.minFee;
    } else if (rule.maxFee && rule.maxFee.lessThan(fee)) {
      fee = rule.maxFee;
    }
    return fee;
  }
}
