import {test, expect} from "../playwright";

test("select version query", async ({page, uiClass, apiClient}) => {
  await page.goto("main/editor");

  await page.locator(".cm-content").fill("select sys::get_version_as_str()");

  await page.getByRole("button", {name: "Run"}).click();

  await expect(uiClass("inspector_scalar_string")).toHaveText(
    await apiClient.queryRequiredSingle<string>(
      `select sys::get_version_as_str()`
    )
  );
});
