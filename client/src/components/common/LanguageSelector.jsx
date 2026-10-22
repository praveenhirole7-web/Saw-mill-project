import React from 'react';
import { LANGUAGES } from '../../i18n/languages';
import { useLanguage } from '../../context/LanguageContext';
import './LanguageSelector.css';

export default function LanguageSelector({ className = '' }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <label className={`language-selector ${className}`.trim()}>
      <span className="language-selector__label">{t('language.select')}</span>
      <select
        aria-label={t('language.select')}
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
      >
        {LANGUAGES.map(({ code, name }) => (
          <option key={code} value={code}>{name}</option>
        ))}
      </select>
    </label>
  );
}
