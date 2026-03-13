export const schemaQuery = `
WITH MODULE schema,
  module_names := (SELECT schema::Module FILTER NOT .builtin).name
SELECT ObjectType {
  name,
  is_abstract,
  from_alias,
  expr,
  inherits_from := (
    SELECT .bases
    FILTER .name != 'std::Object'
    ORDER BY @index
  ).name,
  inherited_by := .<bases[IS ObjectType].name,
  constraints: {
    name,
    params: {
      name,
      @value,
    } FILTER .name != '__subject__'
      ORDER BY .num,
    delegated,
  },
  annotations: {
    name,
    @value
  },
  properties: {
    name,
    targetName := .target.name,
    targetId := .target.id,
    required,
    readonly,
    cardinality,
    expr,
    default,
    constraints: {
      name,
      params: {
        name,
        @value,
      } FILTER .name != '__subject__'
        ORDER BY .num,
      delegated,
    },
    annotations: {
      name,
      @value
    },
  },
  links: {
    name,
    targetNames := (
      WITH target := .target[IS ObjectType]
      SELECT std::array_agg(
        target.name
        IF NOT target.is_compound_type
        ELSE target.union_of.name UNION target.intersection_of.name
      )
    ),
    required,
    readonly,
    cardinality,
    expr,
    default,
    constraints: {
      name,
      params: {
        name,
        @value,
      } FILTER .name != '__subject__'
        ORDER BY .num,
      delegated,
    },
    annotations: {
      name,
      @value
    },
    properties: {
      name,
      targetName := .target.name,
      required,
      expr,
      default,
      constraints: {
        name,
        params: {
          name,
          @value,
        } FILTER .name != '__subject__'
          ORDER BY .num,
        delegated,
      },
      annotations: {
        name,
        @value
      },
    } FILTER .name NOT IN {'source', 'target'}
  } FILTER .name != '__type__'
}
FILTER .name LIKE module_names ++ '::%'
   AND NOT .is_compound_type
ORDER BY count(.links) DESC
  THEN .name
`;
