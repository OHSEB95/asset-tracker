const TYPE_ROW_CLASS: Record<string, string> = {
  해외주식: 'row-type-foreign-stock',
  국내주식: 'row-type-domestic-stock',
  안전자산: 'row-type-youth-savings',
  연금저축펀드: 'row-type-pension-fund',
  IRP: 'row-type-irp',
  ISA: 'row-type-isa',
  비트코인: 'row-type-bitcoin'
}

export function typeRowClass(accountTypeLabel: string): string {
  return TYPE_ROW_CLASS[accountTypeLabel] ?? ''
}
