import { z } from 'zod';

/** An UPPER_SNAKE_CASE name: an environment variable, or an error name the owner defines. */
export const UPPER_SNAKE_CASE = /^[A-Z][A-Z0-9_]*$/;

/** The name of one of the owner's environment variables: a config holds the name, never the value. */
export const EnvNameSchema = z.string().regex(UPPER_SNAKE_CASE);
