import {test, expect} from "../playwright";

test.describe("repl", () => {
  test.beforeEach(async ({page}) => {
    await page.goto("_test/repl");
  });

  test("check basic UI and click on \\help command", async ({uiClass}) => {
    const header = uiClass("repl_replHeader");
    const headerMessage = header.locator(uiClass("repl_headerMsg"));

    // click on \help
    await headerMessage.getByText("\\help").click();

    const response = uiClass("repl_replHistoryItem");

    await expect(response.locator(uiClass("repl_historyPrompt"))).toHaveText(
      "_test[query]>"
    );
    await expect(response.locator(uiClass("repl_code"))).toHaveText("\\help");

    await expect(response.locator(uiClass("repl_historyTime"))).toBeVisible();
    await expect(
      response.locator(uiClass("repl_historyOutput"))
    ).toBeVisible();
  });

  test("type query and check result", async ({uiClass}) => {
    const replInput = uiClass("repl_replInput").locator(".cm-content");

    // type \l command
    await replInput.fill("\\l");
    await replInput.press("Enter");

    const response = uiClass("repl_replHistoryItem");

    await expect(response).toHaveCount(1);

    await expect(response.last().locator(uiClass("repl_code"))).toHaveText(
      "\\l"
    );
  });

  test("check query warnings are rendered", async ({uiClass}) => {
    const replInput = uiClass("repl_replInput").locator(".cm-content");

    await replInput.fill(`select Movie {title}\nfilter {true, false};`);
    await replInput.press("Enter");

    const response = uiClass("repl_replHistoryItem");

    const warnings = response.locator(uiClass("repl_queryWarnings"));
    await expect(warnings).toHaveCount(1);

    await expect(warnings).toContainText(
      "Warning: possibly more than one element returned by an expression in a FILTER clause"
    );
  });
});
