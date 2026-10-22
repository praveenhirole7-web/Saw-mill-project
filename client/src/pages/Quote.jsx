import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import FormInput from '../components/common/FormInput';
import FormTextarea from '../components/common/FormTextarea';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import { submitPublicEnquiry } from '../services/publicEnquiry';
import './Quote.css';

export default function Quote() {
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState(() => ({
    name: '',
    phone: '',
    email: '',
    product: searchParams.get('product') || '',
    quantity: '',
    unit: '',
    dimensions: '',
    service: searchParams.get('service') || '',
    message: '',
    website: ''
  }));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!formData.phone.trim() && !formData.email.trim()) {
      setError('Enter a phone number or email so we can reply.');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await submitPublicEnquiry({
        source: 'quote',
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        requested_product: formData.product,
        quantity: formData.quantity,
        quantity_unit: formData.unit,
        dimensions: formData.dimensions,
        service_required: formData.service,
        message: [formData.service && `Requested service: ${formData.service}`, formData.dimensions && `Dimensions: ${formData.dimensions}`, formData.message]
          .filter(Boolean)
          .join('\n'),
        website: formData.website
      });
      setReference(saved.reference);
    } catch (submitError) {
      setError(submitError.message || 'We could not save your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="quote-page">
      <PageHeader
        eyebrow="Ask for a Price"
        title="Tell Us What You Need"
        subtitle="Tell us what wood and size you need. We will contact you with the price."
        breadcrumbs={[{ label: 'Ask for a Price' }]}
      />
      <section className="quote-form-section">
        <div className="container">
          <div className="quote-form-card">
            {error && <Alert type="error" title="Request not submitted" message={error} />}
            {reference ? (
              <div className="quote-success-panel" role="status">
                <CheckCircle2 size={48} color="#137333" />
                <h2 className="quote-success-title">Request saved</h2>
                <p>Your request was saved. Keep this number: <strong>{reference}</strong></p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="form-helper">Fields with * are required. Enter a phone number or email so we can reply.</p>
                <div className="form-row-2">
                  <FormInput id="quote-name" name="name" label="Name" value={formData.name} onChange={handleChange} required maxLength={120} />
                  <FormInput id="quote-phone" name="phone" label="Phone" type="tel" value={formData.phone} onChange={handleChange} maxLength={30} />
                </div>
                <FormInput id="quote-email" name="email" label="Email" type="email" value={formData.email} onChange={handleChange} maxLength={150} />
                <FormInput id="quote-product" name="product" label="Wood type or product" value={formData.product} onChange={handleChange} required maxLength={150} />
                <div className="form-row-2">
                  <FormInput id="quote-quantity" name="quantity" label="Quantity" type="number" min="0.001" step="0.001" value={formData.quantity} onChange={handleChange} required />
                  <FormInput id="quote-unit" name="unit" label="Unit" value={formData.unit} onChange={handleChange} required maxLength={40} placeholder="For example: pieces, CFT, metres" helperText="CFT means cubic feet." />
                </div>
                <FormInput id="quote-dimensions" name="dimensions" label="Size and details" value={formData.dimensions} onChange={handleChange} maxLength={500} />
                <FormInput id="quote-service" name="service" label="Cutting or other work needed" value={formData.service} onChange={handleChange} maxLength={150} />
                <FormTextarea id="quote-message" name="message" label="Message" value={formData.message} onChange={handleChange} rows={4} required maxLength={4000} />
                <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)' }}>
                  <label htmlFor="quote-website">Leave blank</label>
                  <input id="quote-website" name="website" value={formData.website} onChange={handleChange} tabIndex="-1" autoComplete="off" />
                </div>
                <Button type="submit" variant="primary" size="lg" disabled={submitting} icon={<Send size={18} />} fullWidth>
                  {submitting ? 'Sending...' : 'Send Price Request'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
