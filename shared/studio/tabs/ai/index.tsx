import {DatabaseTabSpec} from "../../components/databasePage";
import {TabAIIcon} from "../../icons";
import AIPrograms from "./programs";

export const aiTabSpec: DatabaseTabSpec = {
  path: "ai",
  label: "AI",
  icon: (active) => <TabAIIcon active={active} />,
  usesSessionState: false,
  element: <AIPrograms />,
  allowNested: true,
};
