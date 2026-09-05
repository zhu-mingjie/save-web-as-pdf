import type { MessageResponse, RuntimeRequest } from "../shared/messages";
import { createSourcePageMetadata } from "../shared/filename";

const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const editButton = document.querySelector<HTMLButtonElement>("#edit")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("No active tab is available.");
  return tab;
}

async function request(message: RuntimeRequest, busyText: string): Promise<void> {
  saveButton.disabled = true;
  editButton.disabled = true;
  status.className = "busy";
  status.textContent = busyText;
  try {
    const response = (await chrome.runtime.sendMessage(message)) as MessageResponse;
    if (!response.ok) throw new Error(response.error);
    window.close();
  } catch (error) {
    status.className = "";
    status.textContent = error instanceof Error ? error.message : String(error);
    saveButton.disabled = false;
    editButton.disabled = false;
  }
}

saveButton.addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    await request(
      {
        type: "START_EXPORT",
        tabId: tab.id!,
        metadata: createSourcePageMetadata(tab.title, tab.url)
      },
      "Preparing the page…"
    );
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});

editButton.addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    await request(
      {
        type: "START_EDITOR",
        tabId: tab.id!,
        metadata: createSourcePageMetadata(tab.title, tab.url)
      },
      "Opening editor…"
    );
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});
