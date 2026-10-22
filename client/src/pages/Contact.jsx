import React, { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import FormInput from '../components/common/FormInput';
import FormTextarea from '../components/common/FormTextarea';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import { submitPublicEnquiry } from '../services/publicEnquiry';
import './Contact.css';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', product: '', message: '', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
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
        source: 'contact',
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        requested_product: formData.product,
        quantity: '1',
        quantity_unit: 'enquiry',
        message: formData.message,
        website: formData.website
      });
      setReference(saved.reference);
    } catch (submitError) {
      setError(submitError.message || 'We could not save your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="contact-page">
      <PageHeader
        eyebrow="Contact"
        title="Send a Message"
        subtitle="Send us your details and message. We will tell you when we receive it."
        breadcrumbs={[{ label: 'Contact Us' }]}
      />
      <section className="contact-main-section">
        <div className="container">
          <div className="contact-form-card">
            {error && <Alert type="error" title="Message not submitted" message={error} />}
            {reference ? (
              <div role="status">
                <CheckCircle2 size={48} color="#137333" />
                <h2>Enquiry saved</h2>
                <p>Your message was saved. Keep this number: <strong>{reference}</strong></p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="form-helper">Enter a phone number or email so we can reply. Fields with * are required.</p>
                <div className="form-row-2">
                  <FormInput id="contact-name" name="name" label="Name" value={formData.name} onChange={handleChange} required maxLength={120} />
                  <FormInput id="contact-phone" name="phone" label="Phone" type="tel" value={formData.phone} onChange={handleChange} maxLength={30} />
                </div>
                <FormInput id="contact-email" name="email" label="Email" type="email" value={formData.email} onChange={handleChange} maxLength={150} />
                <FormInput id="contact-product" name="product" label="What do you need help with?" value={formData.product} onChange={handleChange} required maxLength={150} />
                <FormTextarea id="contact-message" name="message" label="Message" value={formData.message} onChange={handleChange} required rows={5} maxLength={4000} />
                <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)' }}>
                  <label htmlFor="contact-website">Leave blank</label>
                  <input id="contact-website" name="website" value={formData.website} onChange={handleChange} tabIndex="-1" autoComplete="off" />
                </div>
                <Button type="submit" variant="primary" size="lg" disabled={submitting} icon={<Send size={18} />} fullWidth>
                  {submitting ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
