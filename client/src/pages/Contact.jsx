import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, CheckCircle2, Phone, Mail, MessageSquareText } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import FormInput from '../components/common/FormInput';
import FormTextarea from '../components/common/FormTextarea';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import SeoMeta from '../components/common/SeoMeta';
import { submitPublicEnquiry } from '../services/publicEnquiry';
import './Contact.css';

export default function Contact() {
  const navigate = useNavigate();
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

    const trimmedPhone = formData.phone.trim();
    const trimmedEmail = formData.email.trim();
    const trimmedMessage = formData.message.trim();
    const trimmedProduct = formData.product.trim();

    if (!trimmedPhone && !trimmedEmail) {
      setError('Enter a phone number or email so we can reply.');
      return;
    }
    if (!trimmedProduct) {
      setError('Please tell us what you need help with.');
      return;
    }
    if (!trimmedMessage) {
      setError('Please add a short message before sending.');
      return;
    }
    if (formData.website.trim()) {
      setError('Your submission could not be processed.');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await submitPublicEnquiry({
        source: 'contact',
        name: formData.name.trim(),
        phone: trimmedPhone,
        email: trimmedEmail,
        requested_product: trimmedProduct,
        quantity: '1',
        quantity_unit: 'enquiry',
        message: trimmedMessage,
        website: ''
      });
      setReference(saved.reference);
      navigate('/thank-you', { replace: true });
    } catch (submitError) {
      setError(submitError.message || 'We could not save your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="contact-page">
      <SeoMeta
        title="Contact TimberCraft Saw Mill"
        description="Contact the TimberCraft Saw Mill team for timber supply, custom cutting, and price enquiries."
        path="/contact"
      />
      <PageHeader
        eyebrow="Contact"
        title="Need help? Contact us"
        subtitle="Tell us what you need. We will reply quickly and help you with the next step."
        breadcrumbs={[{ label: 'Contact Us' }]}
      />
      <section className="contact-main-section">
        <div className="container">
          <div className="contact-form-card">
            <div className="contact-quick-help">
              <div className="contact-quick-help__item">
                <Phone size={18} />
                <span>Call or message us</span>
              </div>
              <div className="contact-quick-help__item">
                <Mail size={18} />
                <span>Send your details</span>
              </div>
              <div className="contact-quick-help__item">
                <MessageSquareText size={18} />
                <span>Get a quick reply</span>
              </div>
            </div>

            {error && <Alert type="error" title="Message not submitted" message={error} />}
            {reference ? (
              <div role="status">
                <CheckCircle2 size={48} color="#137333" />
                <h2>Enquiry saved</h2>
                <p>Your message was saved. Keep this number: <strong>{reference}</strong></p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <p className="form-helper">Enter your phone number or email so we can contact you. All required fields are marked.</p>
                <div className="form-row-2">
                  <FormInput id="contact-name" name="name" label="Your name" value={formData.name} onChange={handleChange} required maxLength={120} />
                  <FormInput id="contact-phone" name="phone" label="Phone number" type="tel" value={formData.phone} onChange={handleChange} maxLength={30} />
                </div>
                <FormInput id="contact-email" name="email" label="Email" type="email" value={formData.email} onChange={handleChange} maxLength={150} />
                <FormInput id="contact-product" name="product" label="What do you need help with?" value={formData.product} onChange={handleChange} required maxLength={150} />
                <FormTextarea id="contact-message" name="message" label="Message" value={formData.message} onChange={handleChange} required rows={5} maxLength={4000} />
                <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)' }}>
                  <label htmlFor="contact-website">Leave blank</label>
                  <input id="contact-website" name="website" value={formData.website} onChange={handleChange} tabIndex="-1" autoComplete="off" />
                </div>
                <Button type="submit" variant="primary" size="lg" disabled={submitting} icon={<Send size={18} />} fullWidth>
                  {submitting ? 'Sending...' : 'Send message'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
