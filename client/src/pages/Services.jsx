import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Scissors, Truck, PackageCheck } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import SeoMeta from '../components/common/SeoMeta';
import './Services.css';

const serviceCards = [
  { title: 'Wood supply', text: 'Buy finished wood in the size and amount you need.', icon: PackageCheck },
  { title: 'Custom cutting', text: 'Get wood cut to the size you need for work or furniture.', icon: Scissors },
  { title: 'Delivery support', text: 'We can help with delivery and product details for your order.', icon: Truck }
];

export default function Services() {
  return (
    <div className="services-page">
      <SeoMeta
        title="Saw mill services"
        description="Explore TimberCraft Saw Mill services for wood supply, custom cutting, and milling support for commercial and residential projects."
        path="/services"
      />
      <PageHeader
        eyebrow="Mill Services"
        title="Easy wood services"
        subtitle="Simple help for wood buying, cutting, and delivery. Tell us what you need and we will guide you."
        breadcrumbs={[{ label: 'Services' }]}
      />
      <section className="services-list-section">
        <div className="container">
          <div className="service-grid">
            {serviceCards.map(({ title, text, icon: Icon }) => (
              <div key={title} className="simple-card service-card">
                <div className="simple-card__icon"><Icon size={22} /></div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            ))}
          </div>

          <div className="simple-card simple-card--wide">
            <h2 className="section-title">Need help with a custom request?</h2>
            <p className="section-subtitle">
              Send us the wood type, size, and quantity. We will reply with price and next steps.
            </p>
            <Link to="/quote">
              <Button variant="primary" size="md" icon={<ArrowRight size={16} />}>
                Ask for a price
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
