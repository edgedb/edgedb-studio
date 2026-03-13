import {test, expect} from "../playwright";

test.describe("queryEditor", () => {
  test.beforeEach(async ({page, uiClass, mockClipboard}) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    mockClipboard;

    await page.goto("_test/editor");

    // wait until schema and data loaded
    await expect(uiClass("codeEditor_codeEditor")).toBeVisible();
  });

  test.describe("editor", () => {
    test("enter invalid query: InvalidReferenceError", async ({
      page,
      uiClass,
    }) => {
      const editor = page.locator(".cm-content");

      await editor.fill("select Movie { title } filter .releaseyear = 2015");

      // run the query
      await page.getByRole("button", {name: "Run"}).click();

      const errorElement = uiClass("queryeditor_queryError");

      await expect(
        errorElement.locator(uiClass("queryeditor_errorName"))
      ).toHaveText("InvalidReferenceError");

      await expect(
        errorElement.locator(uiClass("queryeditor_errorHint"))
      ).toHaveText("Hint: did you mean 'release_year'?");
    });

    test("enter invalid query: SQLSyntaxError", async ({page, uiClass}) => {
      const editor = page.locator(".cm-content");

      await editor.fill("select Movie { title } filter .release_year = 2015)");

      // run the query
      await page.getByRole("button", {name: "Run"}).click();

      const errorElement = uiClass("queryeditor_queryError");

      await expect(
        errorElement.locator(uiClass("queryeditor_errorName"))
      ).toHaveText("SQLSyntaxError");
    });

    test("enter valid query, get results, copy and view them", async ({
      page,
      uiClass,
      mockClipboard,
    }) => {
      const editor = page.locator(".cm-content");

      await editor.fill("select Movie { title } filter .release_year = 2015");

      // run the query
      await editor.press("ControlOrMeta+Enter");

      const inspector = uiClass("queryeditor_inspector");

      const results = inspector.locator(uiClass("inspector_scalar_string"));

      await expect(results.nth(0)).toHaveText("Ant-Man");
      await expect(results.nth(1)).toHaveText("Avengers: Age of Ultron");

      // there should be copy buttons for the whole result and for all its parts
      const copyButtons = inspector.locator(uiClass("inspector_copyButton"));

      // there should be copy options for the whole result and every result's parts and their parts
      await expect(copyButtons).toHaveCount(5);
      await expect(copyButtons.first()).toContainText("Copy");

      // copy the whole result to the clipboard
      await copyButtons.first().click();
      await expect(copyButtons.first()).toContainText("Copied");

      expect(mockClipboard.getClipboardData()).toBe(
        `[
  {
    "title": "Ant-Man"
  },
  {
    "title": "Avengers: Age of Ultron"
  }
]`
      );

      // when clicking on view button, new window is opened
      const viewButtons = await inspector.locator(
        uiClass("inspector_viewButton")
      );

      await expect(viewButtons.first()).toContainText("View");

      await viewButtons.first().click();

      // wait for the view window to open
      const viewWindow = uiClass("queryeditor_extendedViewerContainer");

      // linewrap / show whitespace
      const actionButtons = await viewWindow.locator(
        uiClass("shared_toggleButton")
      );

      await expect(actionButtons).toHaveCount(2);
      await expect(actionButtons.nth(0)).toHaveText("Linewrap");
      await expect(actionButtons.nth(1)).toHaveText("Show Whitespace");

      await viewWindow.locator(uiClass("shared_closeButton")).click();

      await expect(viewWindow).toBeHidden();
    });

    test("open history and choose item to edit", async ({page, uiClass}) => {
      // firstly run some query to be sure there's something in the history
      const editor = page.locator(".cm-content");

      await editor.fill("select 1 + 1");

      // run the query and populate the history
      await page.getByRole("button", {name: "Run"}).click();

      // write something else in the editor
      await editor.fill("select 2 + 2");

      // save the current editor text to be able to compare it later with the other one from history
      const draftQuery = await editor.textContent();

      await uiClass("queryeditor_historyButton").click();

      await expect(uiClass("queryeditor_history")).toBeVisible();

      // click on first history query (that is not draft query)
      const historyItems = uiClass("queryeditor_historyItem");
      await historyItems.first().click();

      // click on edit button
      await uiClass("queryeditor_loadButton").click();

      await expect(editor).not.toHaveText(draftQuery!);

      // history sidebar is closed
      await expect(uiClass("queryeditor_history")).toBeHidden();
    });

    test("check query warnings are rendered", async ({page, uiClass}) => {
      const editor = page.locator(".cm-content");

      await editor.fill("select Movie { title } filter {true, false}");

      // run the query
      await page.getByRole("button", {name: "Run"}).click();

      const result = uiClass("queryeditor_queryResult");

      const warnings = result.locator(uiClass("queryeditor_queryWarnings"));
      await expect(warnings).toHaveCount(1);

      await expect(
        warnings.locator(uiClass("queryeditor_errorName"))
      ).toHaveText("Warning");

      await expect(
        warnings.locator(uiClass("queryeditor_queryError"))
      ).toContainText(
        "possibly more than one element returned by an expression in a FILTER clause"
      );

      await expect(
        warnings.locator(uiClass("queryeditor_errorHint"))
      ).toHaveText("Hint: If this is intended, try using any()");
    });
  });

  test.describe("builder", () => {
    test.beforeEach(async ({uiClass}) => {
      // click on builder tab
      await uiClass("queryeditor_tab").nth(1).click();

      // wait for builder window to show
      await expect(uiClass("queryBuilder_queryBuilder")).toBeVisible();
    });

    test("queryBuilder renders correctly", async ({uiClass}) => {
      const container = uiClass("queryBuilder_queryBuilder");

      // select keyword should be shown
      await expect(
        container.locator(uiClass("queryBuilder_keyword"))
      ).toHaveText("select");

      // select dropdown with all existing db objects should be shown
      await expect(
        container.locator(uiClass("queryBuilder_select"))
      ).toBeVisible();

      // id checkbox should exists
      const checkboxes = container.locator(uiClass("queryBuilder_inactive"));
      await expect(checkboxes).toHaveCount(3);

      // 4 query modifiers should be visible
      const modButtons = container.locator(uiClass("queryBuilder_modButton"));
      await expect(modButtons).toHaveCount(4);
      await expect(modButtons.nth(0)).toHaveText("filter");
      await expect(modButtons.nth(1)).toHaveText("order by");
      await expect(modButtons.nth(2)).toHaveText("offset");
      await expect(modButtons.nth(3)).toHaveText("limit");
    });
  });
});
