import React from "react";

import {SchemaState} from ".";

export const schemaContext = React.createContext<SchemaState | null>(null);

export const useSchemaState = () => {
  const state = React.useContext(schemaContext);
  if (!state) {
    throw new Error("useSchemaState must be used within a Provider.");
  }
  return state;
};
