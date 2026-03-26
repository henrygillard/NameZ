export const toCST = (date) =>
  date
    ? new Date(date).toLocaleString("en-US", { timeZone: "America/Chicago" })
    : null;

/**
 * Returns a shallow copy of obj with every Date-valued field converted to a
 * CST locale string. Non-Date fields are left untouched.
 */
export const convertDatesToCst = (obj) => {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = value instanceof Date ? toCST(value) : value;
  }
  return result;
};
