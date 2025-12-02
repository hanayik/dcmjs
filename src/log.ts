import log, { type LogLevelDesc } from "loglevel";

const logLevel: LogLevelDesc = (process.env.LOG_LEVEL as LogLevelDesc) ?? "warn";

log.setLevel(logLevel);

const validationLog = log.getLogger("validation.dcmjs");

export { log, validationLog };
export default log;
