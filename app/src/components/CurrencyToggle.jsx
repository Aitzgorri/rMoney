import styles from './CurrencyToggle.module.css'

export default function CurrencyToggle({ value, onChange, tradingCurrency, mainCurrency }) {
  const tradingLabel = tradingCurrency ? `Trading (${tradingCurrency})` : 'Trading'
  const mainLabel    = mainCurrency    ? `Main (${mainCurrency})`        : 'Main'

  return (
    <div className={styles.toggle}>
      <button
        type="button"
        className={`${styles.btn} ${value === 'trading' ? styles.active : ''}`}
        onClick={() => onChange('trading')}
        title="Show amounts in the trading currency"
      >
        {tradingLabel}
      </button>
      <button
        type="button"
        className={`${styles.btn} ${value === 'main' ? styles.active : ''}`}
        onClick={() => onChange('main')}
        title="Show amounts in your main currency"
      >
        {mainLabel}
      </button>
    </div>
  )
}
