import styles from './InlineFormRow.module.css'

// A fully-controlled expandable "add row" used on desktop list screens.
// When collapsed: shows a dashed "+ Label" button at the top of the list.
// When expanded: renders the form passed as children (render prop).
//
// Usage:
//   const [open, setOpen] = useState(false)
//   <InlineFormRow label="Add transaction" open={open} onOpenChange={setOpen}>
//     {onCollapse => <MyForm onSave={() => { save(); onCollapse() }} onCancel={onCollapse} />}
//   </InlineFormRow>
export default function InlineFormRow({ label, open, onOpenChange, children }) {
  if (!open) {
    return (
      <button className={styles.addRow} onClick={() => onOpenChange(true)}>
        <span className={styles.plus}>+</span>
        {label}
      </button>
    )
  }
  return (
    <div className={styles.formRow}>
      {children(() => onOpenChange(false))}
    </div>
  )
}
