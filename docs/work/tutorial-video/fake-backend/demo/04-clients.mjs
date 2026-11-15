// Demo data, chapter 4 (clients).
//   - one walk-in client already marked temporary (the "Temporary" list is not empty): the app keeps "[TEMPORARY]" in the notes;
//   - Sarah Whitfield (notes, two jobs, a signed estimate, an unpaid invoice, a private portal link already made) also has one
//     change order that waits for her signature, so "Get approval" lists a document with a "Copy link" button.
// The new client "Maria Delgado" is created live in the chapter (the backend is reset before the next chapter).
export default ({ tables, uid, day, iso, id }) => {
  const clients = tables.get('clients');
  const docs = tables.get('documents');
  const jobs = tables.get('jobs');

  if (!clients.some((c) => c.name === 'Pat Donnelly')) {
    clients.push({
      id: id(), user_id: uid, name: 'Pat Donnelly', email: '', phone: '(555) 010-3107', address: '31 Mill Street, Lakeside, OH',
      notes: '[TEMPORARY] Walk-in. Wants a price on a deck railing.', portal_key: 'demo-portal-pat', created_at: iso(-4),
    });
  }

  const sarah = clients.find((c) => c.name === 'Sarah Whitfield');
  const kitchen = jobs.find((j) => j.name === 'Whitfield Kitchen Remodel');
  if (sarah && kitchen && !docs.some((d) => d.data && d.data.changeOrderNumber === 'CO-1002')) {
    docs.push({
      id: id(), user_id: uid, job_id: kitchen.id, client_id: sarah.id, type: 'Change Order',
      data: {
        changeOrderNumber: 'CO-1002', title: 'Dimmer switches for the under-cabinet lights', issueDate: day(-2), status: 'Sent', taxRate: 7.5,
        companyName: 'Northline Remodeling', clientName: sarah.name, clientAddress: sarah.address,
        lineItems: [
          { id: id(), description: 'Dimmer switches, 3 gang', quantity: 1, rate: 210, unitCost: 95 },
          { id: id(), description: 'Electrician, half a day', quantity: 1, rate: 320, unitCost: 0 },
        ],
        notes: 'Needs your approval before we order the parts.',
      },
      created_at: iso(-2), updated_at: iso(-2), public_token: id().replace(/-/g, '').slice(0, 24),
    });
  }
};
