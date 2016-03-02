/// <reference path="typings/lodash/lodash.d.ts" />
/// <reference path="nakedobjects.models.ts" />

module NakedObjects.Angular {

    export interface ILocalFilter {
        filter(val: any): string;
    }

    export interface IMaskMap {
        [index: string]: ILocalFilter;
    }

    export interface IMask {
        toLocalFilter(remoteMask: string, format: string): ILocalFilter;
        defaultLocalFilter(format: string): ILocalFilter;
        setMaskMapping(key: string, name: string, mask: string);
    }


    app.service("mask", function ($filter: ng.IFilterService) {
        const maskService = <IMask>this;
        const maskMap: IMaskMap = {};

        class LocalFilter implements ILocalFilter {

            constructor(private name?: string, private mask?: string, private tz?: string) { }

            filter(val): string {
                if (this.name) {
                    return $filter(this.name)(val, this.mask, this.tz);
                }
                // number should be filtered
                return val ? val.toString() : "";
            }
        }

        maskService.defaultLocalFilter = (format: string) => {
            switch (format) {
                case ("string"):
                    return new LocalFilter();
                case ("date-time"):
                    return new LocalFilter("date", "d MMM yyyy hh:mm:ss");
                case ("date"):
                    return new LocalFilter("date", "d MMM yyyy");
                case ("time"):
                    return new LocalFilter("date", "hh:mm:ss");
                case ("utc-millisec"):
                    return new LocalFilter("number");
                case ("big-integer"):
                    return new LocalFilter("number");
                case ("big-decimal"):
                    return new LocalFilter("number");
                case ("blob"):
                    return new LocalFilter();
                case ("clob"):
                    return new LocalFilter();
                case ("decimal"):
                    return new LocalFilter("number");
                //return { name: "currency", mask: "$" };
                case ("int"):
                    return new LocalFilter("number");
                default:
                    return new LocalFilter();
            }
        }


        maskService.toLocalFilter = (remoteMask: string, format: string) => {
            return maskMap[remoteMask] || maskService.defaultLocalFilter(format);
        }

        maskService.setMaskMapping = (key: string, name: string, mask: string) => {
            maskMap[key] = new LocalFilter(name, mask);
        }


    });
}