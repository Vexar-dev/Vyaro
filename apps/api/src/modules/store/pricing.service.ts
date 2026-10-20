import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Money } from '../../common/money/money';
import { convertMinor } from '../conversion/conversion.service';

export type MarginType = 'PERCENT' | 'FIXED';

/**
 * Sale price of a ProviderService:
 *   1. manualPrice, if the admin set one (always wins), else
 *   2. cost (converted to the sale asset if needed) + margin (PERCENT of cost, or FIXED amount), rounded UP, else
 *   3. the existing priceAmount untouched (nothing to compute from).
 * The result is written to ProviderService.priceAmount — the single field orders read and snapshot.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(ps: {
    priceAssetCode: string;
    priceAmount: string;
    costAmount: string | null;
    costAssetCode: string | null;
    marginType: string | null;
    marginValue: string | null;
    manualPrice: string | null;
  }): Promise<string> {
    const saleAsset = await this.prisma.asset.findUnique({ where: { code: ps.priceAssetCode } });
    if (!saleAsset) throw new BadRequestException({ code: 'ASSET_NOT_FOUND', message: 'عملة السعر غير موجودة' });

    if (ps.manualPrice) return Money.fromDecimalString(ps.manualPrice, saleAsset.decimals).toDecimalString();
    if (!ps.costAmount || !ps.costAssetCode || !ps.marginType || ps.marginValue == null) return ps.priceAmount;

    const costAsset = await this.prisma.asset.findUnique({ where: { code: ps.costAssetCode } });
    if (!costAsset) throw new BadRequestException({ code: 'ASSET_NOT_FOUND', message: 'عملة التكلفة غير موجودة' });

    let costMinor = Money.fromDecimalString(ps.costAmount, costAsset.decimals).toMinorUnits();
    let decimals = costAsset.decimals;
    if (costAsset.code !== saleAsset.code) {
      const rate = await this.prisma.exchangeRate.findUnique({
        where: { fromAssetCode_toAssetCode: { fromAssetCode: costAsset.code, toAssetCode: saleAsset.code } },
      });
      if (!rate || !rate.isActive) {
        throw new BadRequestException({ code: 'NO_RATE', message: `لا يوجد سعر صرف من ${costAsset.code} إلى ${saleAsset.code}` });
      }
      costMinor = convertMinor(costMinor, rate.rate, costAsset.decimals, saleAsset.decimals);
      decimals = saleAsset.decimals;
    }

    let priceMinor: bigint;
    if (ps.marginType === 'PERCENT') {
      if (!/^\d{1,4}(\.\d{1,2})?$/.test(ps.marginValue)) throw new BadRequestException({ code: 'MARGIN_INVALID', message: 'نسبة الهامش غير صالحة' });
      const [i, f = ''] = ps.marginValue.split('.');
      const bps = BigInt(i) * 100n + BigInt(f.padEnd(2, '0'));
      priceMinor = costMinor + (costMinor * bps + 9999n) / 10000n; // round the margin UP
    } else if (ps.marginType === 'FIXED') {
      priceMinor = costMinor + Money.fromDecimalString(ps.marginValue, decimals).toMinorUnits();
    } else {
      throw new BadRequestException({ code: 'MARGIN_INVALID', message: 'نوع الهامش غير صالح' });
    }
    if (priceMinor <= 0n) throw new BadRequestException({ code: 'PRICE_INVALID', message: 'السعر الناتج غير صالح' });
    return Money.fromMinorUnits(priceMinor, decimals).toDecimalString();
  }

  /** Recomputes and persists priceAmount for one ProviderService. Returns the new price. */
  async recompute(providerServiceId: bigint): Promise<string> {
    const ps = await this.prisma.providerService.findUniqueOrThrow({ where: { id: providerServiceId } });
    const price = await this.compute(ps);
    if (price !== ps.priceAmount) {
      await this.prisma.providerService.update({ where: { id: ps.id }, data: { priceAmount: price } });
    }
    return price;
  }
}
