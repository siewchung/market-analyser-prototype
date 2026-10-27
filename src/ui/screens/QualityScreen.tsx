import type { QualityReport } from '../../application/qualityReport';

export function QualityScreen(_props: { readonly report: QualityReport }) {
  return <h1 className="page-title">Data quality report</h1>;
}
