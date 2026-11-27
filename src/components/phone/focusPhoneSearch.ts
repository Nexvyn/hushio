export function focusPhoneSearch(attempts = 12): void {
  const field = document.getElementById("phone-search");
  if (field) {
    field.focus();
    return;
  }
  if (attempts > 0) requestAnimationFrame(() => focusPhoneSearch(attempts - 1));
}
