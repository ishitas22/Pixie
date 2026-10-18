export const bulkDeleteMessage = "Are you sure you would like to delete these images?";

function askConfirm(message: string): boolean {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return window.confirm(message);
  }
  return false;
}

export function confirmDelete(name: string): boolean {
  return askConfirm(`Delete ${name}? This removes that image and only its items and tasks.`);
}

export function confirmBulkDelete(): boolean {
  return askConfirm(bulkDeleteMessage);
}
