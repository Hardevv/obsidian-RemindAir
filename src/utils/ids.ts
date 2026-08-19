import { ID_LETTERS } from "./constants";

export const getRandomIdSuffix = () => ID_LETTERS[Math.floor(Math.random() * ID_LETTERS.length)];
