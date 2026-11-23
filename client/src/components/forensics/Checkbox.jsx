// Native checkbox styled to match the shadcn inputs.
export function Checkbox({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={onChange} className="size-4 rounded border-input accent-primary" />
      {label}
    </label>
  );
}
