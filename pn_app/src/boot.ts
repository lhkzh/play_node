import { Facade } from "pn_api";

Facade._hootDebug = console.log;
Facade._hookErr = console.error;
Facade._hookTj = (apiPath, costMs) => {
    console.log("ApiCostTime: %s %dMS", apiPath, costMs);
};
