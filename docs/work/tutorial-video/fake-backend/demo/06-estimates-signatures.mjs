// Demo data, chapter 6 (estimates, approvals, e-signatures).
//   - the seeded estimate EST-1042 (Whitfield Kitchen Remodel) was signed by Sarah Whitfield this morning: signature image, name,
//     date, so "Client signed" shows in the job list, "Approved by the client" in the form, and the bell / dashboard count it;
//   - the sent estimate EST-1043 (Nair Master Bath) runs out in 2 days: the bell reminds about it ("Valid until" mention);
//   - the job "Halvorsen Deck Estimate" has no documents (chapter 6 writes a new estimate on it).
import { SIGNATURE_A } from './02-dashboard-navigation.mjs';

export default ({ tables, day }) => {
  const docs = tables.get('documents');
  const est1042 = docs.find((d) => d.data && d.data.estimateNumber === 'EST-1042');
  if (est1042) {
    Object.assign(est1042.data, {
      status: 'Accepted',
      clientSignedAt: new Date(Date.now() - 55 * 60_000).toISOString(),
      clientSignedBy: 'Sarah Whitfield',
      clientSignatureUrl: SIGNATURE_A,
      viewedByProvider: false,
    });
  }
  const est1043 = docs.find((d) => d.data && d.data.estimateNumber === 'EST-1043');
  if (est1043) est1043.data.expiryDate = day(2);
};
