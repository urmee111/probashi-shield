import { toast } from 'sonner';

const methods = { success: toast.success, warning: toast.warning, danger: toast.error, info: toast.info };

// One call style for every notification in the app.
export function notify({ variant = 'info', title, body, timeout = 6000 }) {
  (methods[variant] ?? toast)(title, { description: body, duration: timeout });
}
