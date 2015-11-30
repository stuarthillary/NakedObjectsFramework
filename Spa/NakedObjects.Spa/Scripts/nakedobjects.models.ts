﻿//  Copyright 2013-2014 Naked Objects Group Ltd
//  Licensed under the Apache License, Version 2.0(the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.

// ABOUT THIS FILE:
// nakedobjects.models defines a set of classes that correspond directly to the JSON representations returned by Restful Objects
// resources.  These classes provide convenient methods for navigating the contents of those representations, and for
// following links to other resources.

/// <reference path="typings/lodash/lodash.d.ts" />
/// <reference path="nakedobjects.config.ts" />

module NakedObjects {
    import IExtensions = NakedObjects.RoInterfaces.IExtensions;
    import ILink = NakedObjects.RoInterfaces.ILink;
    import IErrorDetailsRepresentation = NakedObjects.RoInterfaces.IErrorDetailsRepresentation;
    import IMenuRepresentation = NakedObjects.RoInterfaces.IMenuRepresentation;
    import IValue = NakedObjects.RoInterfaces.IValue;
    import Resource = angular.resource;

    function isScalarType(typeName: string) {
        return typeName === "string" || typeName === "number" || typeName === "boolean" || typeName === "integer";
    }

    function isListType(typeName: string) {
        return typeName === "list";
    }

    function emptyResource() : RoInterfaces.IResourceRepresentation {
        return { links: [], extensions: {} };
    }

    // interfaces 

    export interface IHateoasModel {
        hateoasUrl: string;
        method: string;
        url: any;
        urlParms: _.Dictionary<string>;
        populate(wrapped: RoInterfaces.IRepresentation);
        getBody(): RoInterfaces.IRepresentation;
        getUrl() : string;
    }

    export interface IOptionalCapabilities {
        blobsClobs: string;
        deleteObjects: string;
        domainModel: string;
        protoPersistentObjects: string;
        validateOnly: string;
    }

    export interface IPagination {
        page: number;
        pageSize: number;
        numPages: number;
        totalCount: number;
    }

    export abstract class ArgumentMap {

        constructor(public map: RoInterfaces.IValueMap, parent: any, public id: string) {         
        }

        populate(wrapped: RoInterfaces.IValueMap) {
            this.map = wrapped;
        }

        getBody(): RoInterfaces.IRepresentation {
            if (this.method === "POST" || this.method === "PUT") {
                return _.clone(this.map);
            }

            return {};
        }

        getUrl() {
            const url = this.url();
            const attrAsJson = _.clone(this.map);

            if (_.keys(attrAsJson).length > 0 && (this.method === "GET" || this.method === "DELETE")) {

                const urlParmsAsJson = _.clone(this.urlParms);
                const asJson = _.merge(attrAsJson, urlParmsAsJson);
                if (_.keys(asJson).length > 0) {
                    const map = JSON.stringify(asJson);
                    const parmString = encodeURI(map);
                    return url + "?" + parmString;
                }
                return url;
            }

            const urlParmString = _.reduce(this.urlParms || {}, (result, n, key) => (result === "" ? "" : result + "&") + key + "=" + n, "");

            return urlParmString !== "" ? url + "?" + urlParmString : url;
        }

        hateoasUrl: string = "";
        method: string = "GET";
      
        url(): string {
            return this.hateoasUrl;
        }

        urlParms: _.Dictionary<string>;
    }

    export class RelParm {

        name: string;
        value : string;

        constructor(public asString: string) {
            this.decomposeParm();
        }

        private decomposeParm() {
            const regex = /(\w+)\W+(\w+)\W+/;
            const result = regex.exec(this.asString);
            [, this.name, this.value] = result;
        }
    }


    // rel helper class 
    export class Rel {

        ns: string = "";
        uniqueValue: string;
        parms: RelParm[] = [];

        constructor(public asString: string) {
            this.decomposeRel();
        }

        private decomposeRel() {

            let postFix: string;

            if (this.asString.substring(0, 3) === "urn") {
                // namespaced 
                this.ns = this.asString.substring(0, this.asString.indexOf("/") + 1);
                postFix = this.asString.substring(this.asString.indexOf("/") + 1);
            } else {
                postFix = this.asString;
            }
            const splitPostFix = postFix.split(";");
            this.uniqueValue = splitPostFix[0];

            if (splitPostFix.length > 1) {
                this.parms = _.map(splitPostFix.slice(1), s => new RelParm(s));
            }
        }
    }

    // Media type helper class 
    export class MediaType {

        applicationType: string;
        profile: string;
        xRoDomainType: string;
        representationType: string;
        domainType: string;

        constructor(public asString: string) {
            this.decomposeMediaType();
        }

        private decomposeMediaType() {
            const parms = this.asString.split(";");
            if (parms.length > 0) {
                this.applicationType = parms[0];
            }

            for (let i = 1; i < parms.length; i++) {
                if (parms[i].trim().substring(0, 7) === "profile") {
                    this.profile = parms[i].trim();
                    const profileValue = (this.profile.split("=")[1].replace(/\"/g, "")).trim();
                    this.representationType = (profileValue.split("/")[1]).trim();
                }
                if (parms[i].trim().substring(0, 16) === "x-ro-domain-type") {
                    this.xRoDomainType = (parms[i]).trim();
                    this.domainType = (this.xRoDomainType.split("=")[1].replace(/\"/g, "")).trim();
                }
            }
        }
    }

    function isILink(object: any): object is RoInterfaces.ILink {
        return object && object instanceof Object  && "href" in object;
    }

    // helper class for values 
    export class Value {

        private wrapped: Link | Array<Link | ILink | number | string | boolean> | number | string | boolean;
    
        constructor(raw: Link | Array<Link | ILink | number | string | boolean> | RoInterfaces.ILink | number | string | boolean ) {
            // can only be Link, number, boolean, string or null    

            if (raw instanceof Array) {
                this.wrapped = raw as Array<Link | ILink | number | string | boolean>;
            } else if (raw instanceof Link) {
                this.wrapped = raw;
            } else if (isILink(raw)) {
                this.wrapped = new Link(raw);
            } else {
                this.wrapped = raw;
            }
        }

        isScalar(): boolean {
            return !this.isReference() && !this.isList();
        }

        isReference(): boolean {
            return this.wrapped instanceof Link;
        }

        isList(): boolean {
            return this.wrapped instanceof Array;
        }

        isNull(): boolean {
            return this.wrapped == null;
        }

        link(): Link {
            return this.isReference() ? <Link>this.wrapped : null;
        }

        scalar(): number | string | boolean {
            return this.isScalar() ? this.wrapped as number | string | boolean : null;
        }

        list(): Value[] {
            return this.isList() ? _.map(this.wrapped as Array<Link | number | string | boolean>, i => new Value(i)) : null;
        }

        toString(): string {
            if (this.isReference()) {
                return this.link().title();
            }

            if (this.isList()) {
                const ss = _.map(this.list(), v =>  v.toString());
                return ss.length === 0 ? "" : _.reduce(ss, (m, s) => m + "-" + s, "");
            }

            return (this.wrapped == null) ? "" : this.wrapped.toString();
        }

        static fromJsonString(jsonString: string): Value {
            return new Value(JSON.parse(jsonString));
        }

        toValueString(): string {
            if (this.isReference()) {
                return this.link().href();
            }
            return (this.wrapped == null) ? "" : this.wrapped.toString();
        }

        toJsonString(): string {
            const raw = (this.wrapped instanceof  Link) ?  (<Link>this.wrapped).wrapped : this.wrapped; 
            return JSON.stringify(raw);
        }

        setValue(target: IValue) {
            if (this.isReference()) {
                target.value = { "href": this.link().href() };
            }
            else if (this.isList()) {
                target.value = _.map(this.list(), (v) => v.isReference() ? { "href": v.link().href() } : v.scalar());
            } else {
                target.value = this.scalar();
            }
        }

        set(target: _.Dictionary<IValue | string>, name: string) {
            const t = target[name] = { "value": null };
            this.setValue(t);
        }
    }

    export interface IValueMap {
        [index: string]: Value;
    }

    export interface IErrorValue {
        value: Value;
        invalidReason: string;
    }

    export interface IErrorValueMap {
        [index: string]: IErrorValue;
    }

    // helper class for results 
    export class Result {
        constructor(public wrapped : RoInterfaces.IDomainObjectRepresentation | RoInterfaces.IListRepresentation | RoInterfaces.IScalarValueRepresentation, private resultType: string) { }

        object(): DomainObjectRepresentation {
            if (!this.isNull() && this.resultType === "object") {
                const dor = new DomainObjectRepresentation();
                dor.populate(this.wrapped);
                return dor;
            }
            return null;
        }

        list(): ListRepresentation {
            if (!this.isNull() && this.resultType === "list") {
                const lr = new ListRepresentation();
                lr.populate(this.wrapped);
                return lr;
            }
            return null;
        }

        scalar(): ScalarValueRepresentation {
            if (!this.isNull() && this.resultType === "scalar") {
                return new ScalarValueRepresentation(this.wrapped as RoInterfaces.IScalarValueRepresentation);
            }
            return null;
        }

        isNull(): boolean {
            return this.wrapped == null;
        }

        isVoid(): boolean {
            return (this.resultType === "void");
        }
    }

    // base class for nested representations 
    export abstract class NestedRepresentation {
        constructor(public resource : RoInterfaces.IResourceRepresentation) { }

        private lazyLinks: Link[];

        links(): Link[] {
            this.lazyLinks = this.lazyLinks || wrapLinks(this.resource.links);
            return this.lazyLinks;
        }

        protected update(newResource: RoInterfaces.IResourceRepresentation) {
            this.resource = newResource;
            this.lazyLinks = null;
        }

        extensions(): IExtensions {
            return this.resource.extensions;
        }
    }

    // base class for all representations that can be directly loaded from the server 
    export abstract class HateoasModelBase implements IHateoasModel {

        hateoasUrl: string = "";
        method: string = "GET";
  
        url(): string {
            return this.hateoasUrl;
        }
    
        abstract populate(wrapped: RoInterfaces.IRepresentation);

        abstract getBody(): RoInterfaces.IRepresentation;

        abstract getUrl(): string;

        urlParms : _.Dictionary<string>;
    }

    function isIObjectOfType(object: any) : object is RoInterfaces.IObjectOfType {
        return object && object instanceof Object && "members" in object;
    }

    function isIValue(object: any): object is RoInterfaces.IValue {
        return object && object instanceof Object && "value" in object;
    }


    export class ErrorMap {

        wrapped = () => {
            const temp = this.map;
            if (isIObjectOfType(temp)) {
                return temp.members;
            } else {
                return temp;
            }
        }

        constructor(private map: RoInterfaces.IValueMap | RoInterfaces.IObjectOfType, public statusCode: number, public warningMessage: string) {

        }

        valuesMap(): IErrorValueMap {

            const values = _.pick(this.wrapped(), i => isIValue(i)) as _.Dictionary<IValue>;
            return _.mapValues(values, v => ({
                value: new Value(v.value),
                invalidReason: v.invalidReason
            }));
        }

        invalidReason() {
            return this.wrapped()["x-ro-invalidReason"] as string;
        }
    }


    export class UpdateMap extends ArgumentMap implements IHateoasModel {
        constructor(private domainObject: DomainObjectRepresentation, map: RoInterfaces.IValueMap) {
            super(map, domainObject, domainObject.instanceId());

            domainObject.updateLink().copyToHateoasModel(this);

            _.each(this.properties(), (value : Value, key : string) => {
                this.setProperty(key, value);
            });
        }   

        properties(): IValueMap {
            return <IValueMap>_.mapValues(this.map, (v : any) => new Value(v.value));
        }

        setProperty(name: string, value: Value) {
            value.set(this.map, name);
        }
    }

    export class AddToRemoveFromMap extends ArgumentMap implements IHateoasModel {
        constructor(private collectionResource: CollectionRepresentation, map: RoInterfaces.IValueMap, add: boolean) {
            super(map, collectionResource, collectionResource.instanceId());
            const link = add ? collectionResource.addToLink() : collectionResource.removeFromLink();
            link.copyToHateoasModel(this);
        }

    }

    export class ModifyMap extends ArgumentMap implements IHateoasModel {
        constructor(private propertyResource: PropertyRepresentation, map: RoInterfaces.IValueMap) {
            super(map, propertyResource, propertyResource.instanceId());

            propertyResource.modifyLink().copyToHateoasModel(this);

            propertyResource.value().set(this.map, this.id);
        }

    }

    export class ModifyMapv11 extends ArgumentMap implements IHateoasModel {
        constructor(private propertyResource: PropertyMember, id: string, map: RoInterfaces.IValueMap) {
            super(map, propertyResource, id);

            propertyResource.modifyLink().copyToHateoasModel(this);

            propertyResource.value().set(this.map, this.id);
        }
    }


    export class ClearMap extends ArgumentMap implements IHateoasModel {
        constructor(propertyResource: PropertyRepresentation) {
            super({}, propertyResource, propertyResource.instanceId());

            propertyResource.clearLink().copyToHateoasModel(this);
        }

    }

    export class ClearMapv11 extends ArgumentMap implements IHateoasModel {
        constructor(propertyResource: PropertyMember, id: string) {
            super({}, propertyResource, id);

            propertyResource.clearLink().copyToHateoasModel(this);
        }
    }

    function wrapLinks(links: ILink[]) {
        return _.map(links, l => new Link(l));
    }

    function getLinkByRel(links: Link[], rel: Rel) {
        return _.find(links, i => i.rel().uniqueValue === rel.uniqueValue);
    }

    function linkByRel(links: Link[], rel: string) {
        return getLinkByRel(links, new Rel(rel));
    }
    

    // REPRESENTATIONS

    export abstract class ResourceRepresentation extends HateoasModelBase {
       
        protected resource : RoInterfaces.IResourceRepresentation;

        populate(wrapped: RoInterfaces.IResourceRepresentation) {
            this.resource = wrapped; 
            //super.populate(wrapped);
        }

        private lazyLinks: Link[];

        links(): Link[] {
            this.lazyLinks = this.lazyLinks || wrapLinks(this.resource.links);
            return this.lazyLinks;
        }

        extensions(): IExtensions {
            return this.resource.extensions;
        }

        // todo DRY this !

        getBody(): RoInterfaces.IRepresentation {
            if (this.method === "POST" || this.method === "PUT") {
                return _.clone(this.resource);
            }

            return {};
        }

        // todo DRY this !

        getUrl() {
            const url = this.url();
            const attrAsJson = _.clone(this.resource);

            if (_.keys(attrAsJson).length > 0 && (this.method === "GET" || this.method === "DELETE")) {

                const urlParmsAsJson = _.clone(this.urlParms);
                const asJson = _.merge(attrAsJson, urlParmsAsJson);
                if (_.keys(asJson).length > 0) {
                    const map = JSON.stringify(asJson);
                    const parmString = encodeURI(map);
                    return url + "?" + parmString;
                }
                return url;
            }

            const urlParmString = _.reduce(this.urlParms || {}, (result, n, key) => (result === "" ? "" : result + "&") + key + "=" + n, "");

            return urlParmString !== "" ? url + "?" + urlParmString : url;
        }
    }

    // matches a action invoke resource 19.0 representation 

    export class ActionResultRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as RoInterfaces.IActionInvokeRepresentation;

        constructor() {
            super();
        }

        // links 
        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        // link representations 
        getSelf(): ActionResultRepresentation {
            return <ActionResultRepresentation> this.selfLink().getTarget();
        }

        // properties 
        resultType(): string {
            return this.wrapped().resultType;
        }

        result(): Result {
            return new Result(this.wrapped().result, this.resultType());
        }

        // helper
        setParameter(name: string, value: Value) {
            // todo investigate and fix better
            this.resource = (this.resource ? this.resource : {}) as any;
            value.set(this.resource as any, name);
        }

        setUrlParameter(name: string, value : string) {
            this.urlParms = this.urlParms || {};
            this.urlParms[name] = value;
        }
    }

    // matches an action representation 18.0 

    // matches 18.2.1
    export class Parameter extends NestedRepresentation {

        wrapped = () => this.resource as RoInterfaces.IParameterRepresentation;

        // fix parent type
        constructor(wrapped: RoInterfaces.IParameterRepresentation, public parent: any, private id : string) {
            super(wrapped);
        }

        parameterId() {
            return this.id;
        }

        // properties 
        choices(): IValueMap {

            // use custom choices extension by preference 
            if (this.extensions()["x-ro-nof-choices"]) {
                return  <IValueMap> _.mapValues(this.extensions()["x-ro-nof-choices"], (v : any) => new Value(v));
            }

            if (this.wrapped().choices) {
                const values = _.map(this.wrapped().choices, (item : any) => new Value(item));
                return _.object<IValueMap>(_.map(values, (v : any) => [v.toString(), v]));
            }
            return null;
        }

        promptLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/prompt");
        }

        getPrompts(): PromptRepresentation {
            return <PromptRepresentation> this.promptLink().getTarget();
        }

        default(): Value {
            return new Value(this.wrapped().default);
        }

        // helper
        isScalar(): boolean {
            return isScalarType(this.extensions().returnType) ||
                   (isListType(this.extensions().returnType) && isScalarType(this.extensions().elementType));
        }

        hasPrompt(): boolean {
            return !!this.promptLink();
        }

    }

    export interface IParameterMap {
        [index: string]: Parameter;
    }

    export class ActionRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as RoInterfaces.IActionRepresentation;

        // links 
        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        upLink(): Link {
            return linkByRel(this.links(), "up");
        }

        invokeLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/invoke");
        }

        // linked representations 
        getSelf(): ActionRepresentation {
            return <ActionRepresentation> this.selfLink().getTarget();
        }

        getUp(): DomainObjectRepresentation {
            return <DomainObjectRepresentation> this.upLink().getTarget();
        }

        getInvoke(): ActionResultRepresentation {
            return <ActionResultRepresentation> this.invokeLink().getTarget();
        }

        // properties 

        actionId(): string {
            return this.wrapped().id;
        }

        private parameterMap: IParameterMap;

        private initParameterMap(): void {

            if (!this.parameterMap) {
                const parameters = this.wrapped().parameters;
                this.parameterMap = _.mapValues(parameters, (p, id) => new Parameter(p, this, id));
            }
        }

        parameters(): IParameterMap {
            this.initParameterMap();
            return this.parameterMap;
        }

        disabledReason(): string {
            return this.wrapped().disabledReason;
        }
    }

    export interface IListOrCollection {
        value(): Link[];
    }

    // new in 1.1 15.0 in spec 

    export class PromptRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as RoInterfaces.IPromptRepresentation;

        constructor() {
            super();
            this.resource = emptyResource() as any;
        }


        // links 
        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        upLink(): Link {
            return linkByRel(this.links(), "up");
        }

        // linked representations 
        getSelf(): PromptRepresentation {
            return <PromptRepresentation> this.selfLink().getTarget();
        }

        getUp(): DomainObjectRepresentation {
            return <DomainObjectRepresentation> this.upLink().getTarget();
        }

        // properties 

        instanceId(): string {
            return this.wrapped().id;
        }

        choices(): IValueMap {
            const ch = this.wrapped().choices;
            if (ch) {
                const values = _.map(ch, item => new Value(item));
                return _.object<IValueMap>(_.map(values, v  => [v.toString(), v]));
            }
            return null;
        }

        reset() {
            this.resource = emptyResource() as any;
        }

        setSearchTerm(term: string) {
            //this.set("x-ro-searchTerm", { "value": term });
            this.setArgument("x-ro-searchTerm", new Value(term));
        }

        setArgument(name: string, val: Value) {
            val.set(this.resource as any, name);
        }

        setArguments(args: IValueMap) {
            _.each(args, (arg, key) => this.setArgument(key, arg));
        }
    }

    // matches a collection representation 17.0 
    export class CollectionRepresentation extends ResourceRepresentation implements IListOrCollection {

        wrapped = () => this.resource as RoInterfaces.ICollectionRepresentation;

        // links 
        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        upLink(): Link {
            return linkByRel(this.links(), "up");
        }

        addToLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/add-to");
        }

        removeFromLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/remove-from");
        }

        // linked representations 
        getSelf(): CollectionRepresentation {
            return <CollectionRepresentation> this.selfLink().getTarget();
        }

        getUp(): DomainObjectRepresentation {
            return <DomainObjectRepresentation> this.upLink().getTarget();
        }

        setFromMap(map: AddToRemoveFromMap) {
            //this.set(map.attributes);
            _.assign(this.resource, map.map);
        }

        private addToMap() {
            return this.addToLink().arguments() as RoInterfaces.IValueMap;
        }

        getAddToMap(): AddToRemoveFromMap {
            if (this.addToLink()) {
                return new AddToRemoveFromMap(this, this.addToMap(), true);
            }
            return null;
        }

        private removeFromMap() {
            return this.removeFromLink().arguments() as RoInterfaces.IValueMap;
        }

        getRemoveFromMap(): AddToRemoveFromMap {
            if (this.removeFromLink()) {
                return new AddToRemoveFromMap(this, this.removeFromMap(), false);
            }
            return null;
        }

        // properties 

        instanceId(): string {
            return this.wrapped().id;
        }

        private lazyValue: Link[];

        value(): Link[] {
            this.lazyValue = this.lazyValue || wrapLinks(this.wrapped().value);
            return this.lazyValue;
        }

        disabledReason(): string {
            return this.wrapped().disabledReason;
        }
    }

    // matches a property representation 16.0 
    export class PropertyRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as RoInterfaces.IPropertyRepresentation;


        // links 
        modifyLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/modify");
        }

        clearLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/clear");
        }

        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        upLink(): Link {
            return linkByRel(this.links(), "up");
        }

        promptLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/prompt");
        }

        private modifyMap() {
            return this.modifyLink().arguments() as RoInterfaces.IValueMap;
        }

        // linked representations 
        getSelf(): PropertyRepresentation {
            return <PropertyRepresentation> this.selfLink().getTarget();
        }

        getUp(): DomainObjectRepresentation {
            return <DomainObjectRepresentation> this.upLink().getTarget();
        }

        setFromModifyMap(map: ModifyMap) {
            //this.set(map.attributes);
            _.assign(this.resource, map.map);
        }

        getModifyMap(): ModifyMap {
            if (this.modifyLink()) {
                return new ModifyMap(this, this.modifyMap());
            }
            return null;
        }

        getClearMap(): ClearMap {
            if (this.clearLink()) {
                return new ClearMap(this);
            }
            return null;
        }

        getPrompts(): PromptRepresentation {
            return <PromptRepresentation> this.promptLink().getTarget();
        }

        // properties 

        instanceId(): string {
            return this.wrapped().id;
        }

        value(): Value {
            return new Value(this.wrapped().value);
        }

        choices(): IValueMap {

            // use custom choices extension by preference 
            if (this.extensions()["x-ro-nof-choices"]) {
                return <IValueMap> _.mapValues(this.extensions()["x-ro-nof-choices"], (v) => new Value(v));
            }
            const ch = this.wrapped().choices;
            if (ch) {
                const values = _.map(ch, item => new Value(item));
                return _.object<IValueMap>(_.map(values, v => [v.toString(), v]));
            }
            return null;
        }

        disabledReason(): string {
            return this.wrapped().disabledReason;
        }

        // helper 
        isScalar(): boolean {
            return isScalarType(this.extensions().returnType);
        }

        hasPrompt(): boolean {
            return !!this.promptLink();
        }
    }


    // matches a domain object representation 14.0 

    // base class for 14.4.1/2/3
    export class Member extends NestedRepresentation {

        wrapped = () => this.resource as RoInterfaces.IMember;

        constructor(wrapped: RoInterfaces.IMember, public parent: DomainObjectRepresentation | MenuRepresentation) {
            super(wrapped);
        }

        update(newValue: RoInterfaces.IMember) {
            super.update(newValue);
        }

        memberType(): string {
            return this.wrapped().memberType;
        }

        detailsLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/details");
        }

        disabledReason(): string {
            return this.wrapped().disabledReason;
        }

        isScalar(): boolean {
            return isScalarType(this.extensions().returnType);
        }

        static wrapMember(toWrap: RoInterfaces.IPropertyMember | RoInterfaces.ICollectionMember | RoInterfaces.IActionMember, parent: DomainObjectRepresentation | MenuRepresentation, id : string): Member {

            if (toWrap.memberType === "property") {
                return new PropertyMember(toWrap as RoInterfaces.IPropertyMember, parent as DomainObjectRepresentation, id);
            }

            if (toWrap.memberType === "collection") {
                return new CollectionMember(toWrap as RoInterfaces.ICollectionMember, parent as DomainObjectRepresentation, id);
            }

            if (toWrap.memberType === "action") {
                return new ActionMember(toWrap as RoInterfaces.IActionMember, parent, id);
            }

            return null;
        }
    }

    // matches 14.4.1
    export class PropertyMember extends Member {

        wrapped = () => this.resource as RoInterfaces.IPropertyMember;

        constructor(wrapped: RoInterfaces.IPropertyMember, parent: DomainObjectRepresentation, private id : string) {
            super(wrapped, parent);
        }

        // inlined 

        propertyId(): string {
            return this.id;
        }

        modifyLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/modify");
        }

        clearLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/clear");
        }

        private modifyMap() {
            return this.modifyLink().arguments() as RoInterfaces.IValueMap;
        }

        setFromModifyMap(map: ModifyMapv11) {
            _.forOwn(map.map, (v, k) => {
                this.wrapped[k] = v;
            });
        }

        getModifyMap(id: string): ModifyMapv11 {
            if (this.modifyLink()) {
                return new ModifyMapv11(this, id, this.modifyMap());
            }
            return null;
        }

        getClearMap(id: string): ClearMapv11 {
            if (this.clearLink()) {
                return new ClearMapv11(this, id);
            }
            return null;
        }

        getPrompts(): PromptRepresentation {
            return <PromptRepresentation> this.promptLink().getTarget();
        }

        //


        value(): Value {
            return new Value(this.wrapped().value);
        }

        update(newValue: RoInterfaces.IPropertyMember): void {
            super.update(newValue);
        }

        attachmentLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/attachment");
        }

        promptLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/prompt");
        }

        getDetails(): PropertyRepresentation {
            return <PropertyRepresentation> this.detailsLink().getTarget();
        }

        hasChoices(): boolean {
            return this.wrapped().hasChoices;
        }

        hasPrompt(): boolean {
            return !!this.promptLink();
        }

        choices(): IValueMap {

            // use custom choices extension by preference 
            if (this.extensions()["x-ro-nof-choices"]) {
                return <IValueMap> _.mapValues(this.extensions()["x-ro-nof-choices"], (v) => new Value(v));
            }
            const ch = this.wrapped().choices;
            if (ch) {
                const values = _.map(ch, (item) => new Value(item));
                return _.object<IValueMap>(_.map(values, (v) => [v.toString(), v]));
            }
            return null;
        }

    }

    // matches 14.4.2 
    export class CollectionMember extends Member {

        wrapped = () => this.resource as RoInterfaces.ICollectionMember;

        constructor(wrapped : RoInterfaces.ICollectionMember, parent : DomainObjectRepresentation, private id : string) {
            super(wrapped, parent);
        }

        collectionId(): string {
            return this.id;
        }

        private lazyValue: Link[];

        value(): Link[] {
            this.lazyValue = this.lazyValue || wrapLinks(this.wrapped().value);
            return this.lazyValue;
        }

        size(): number {
            return this.wrapped().size;
        }

        getDetails(): CollectionRepresentation {
            return <CollectionRepresentation> this.detailsLink().getTarget();
        }
    }

    // matches 14.4.3 
    export class ActionMember extends Member {

        wrapped = () => this.resource as RoInterfaces.IActionMember;

        constructor(wrapped: RoInterfaces.IActionMember, parent :  DomainObjectRepresentation | MenuRepresentation, private id : string) {
            super(wrapped, parent);
        }

        actionId(): string {
            return this.id;
        }

        getDetails(): ActionRepresentation {
            return <ActionRepresentation> this.detailsLink().getTarget();
        }

        // 1.1 inlined 


        invokeLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/invoke");
        }


        getInvoke(): ActionResultRepresentation {
            return <ActionResultRepresentation> this.invokeLink().getTarget();
        }

        // properties 

        private parameterMap: IParameterMap;

        private initParameterMap(): void {

            if (!this.parameterMap) {
                const parameters = this.wrapped().parameters;
                this.parameterMap = _.mapValues(parameters, (p, id) => new Parameter(p, this, id));
            }
        }

        parameters(): IParameterMap {
            this.initParameterMap();
            return this.parameterMap;
        }

        disabledReason(): string {
            return this.wrapped().disabledReason;
        }
    }

    export interface IMemberMap {
        [index: string]: Member;
    }

    export interface IPropertyMemberMap {
        [index: string]: PropertyMember;
    }

    export interface ICollectionMemberMap {
        [index: string]: CollectionMember;
    }

    export interface IActionMemberMap {
        [index: string]: ActionMember;
    }

    export class DomainObjectRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as RoInterfaces.IDomainObjectRepresentation;

        constructor() {
            super();
            this.url = this.getUrl;
        }

        getUrl(): string {
            return this.hateoasUrl || this.selfLink().href();
        }

        title(): string {
            return this.wrapped().title;
        }

        domainType(): string {
            return this.wrapped().domainType;
        }

        serviceId(): string {
            return this.wrapped().serviceId;
        }

        instanceId(): string {
            return this.wrapped().instanceId;
        }

        private memberMap: IMemberMap;
        private propertyMemberMap: IPropertyMemberMap;
        private collectionMemberMap: ICollectionMemberMap;
        private actionMemberMap: IActionMemberMap;

        private resetMemberMaps() {
            const members = this.wrapped().members;
            this.memberMap = _.mapValues(members, (m, id) => Member.wrapMember(m, this, id));
            this.propertyMemberMap = <IPropertyMemberMap> _.pick(this.memberMap, (m: Member) => m.memberType() === "property");
            this.collectionMemberMap = <ICollectionMemberMap> _.pick(this.memberMap, (m: Member) => m.memberType() === "collection");
            this.actionMemberMap = <IActionMemberMap> _.pick(this.memberMap, (m: Member) => m.memberType() === "action");
        }

        private initMemberMaps() {
            if (!this.memberMap) {
                this.resetMemberMaps();
            }
        }

        members(): IMemberMap {
            this.initMemberMaps();
            return this.memberMap;
        }

        propertyMembers(): IPropertyMemberMap {
            this.initMemberMaps();
            return this.propertyMemberMap;
        }

        collectionMembers(): ICollectionMemberMap {
            this.initMemberMaps();
            return this.collectionMemberMap;
        }

        actionMembers(): IActionMemberMap {
            this.initMemberMaps();
            return this.actionMemberMap;
        }

        member(id: string): Member {
            return this.members()[id];
        }

        propertyMember(id: string): PropertyMember {
            return this.propertyMembers()[id];
        }

        collectionMember(id: string): CollectionMember {
            return this.collectionMembers()[id];
        }

        actionMember(id: string): ActionMember {
            return this.actionMembers()[id];
        }

        updateLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/update");
        }

        persistLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/persist");
        }

        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        private updateMap() {
            return this.updateLink().arguments() as RoInterfaces.IValueMap;
        }

        private persistMap() {
            return this.persistLink().arguments() as RoInterfaces.IObjectOfType;
        }

        // linked representations 
        getSelf(): DomainObjectRepresentation {
            return <DomainObjectRepresentation> this.selfLink().getTarget();
        }

        getPersistMap(): PersistMap {
            return new PersistMap(this, this.persistMap());
        }

        getUpdateMap(): UpdateMap {
            return new UpdateMap(this, this.updateMap());
        }

        //setFromUpdateMap(map: UpdateMap) {

        //    _.forOwn(this.members(), (m, k) => {
        //        m.update(map.map.members[k]);
        //    });

        //    // to trigger an update on the domainobject
        //    _.assign(this.resource, map.map);
        //}

        //setFromPersistMap(map: PersistMap) {
        //    // to trigger an update on the domainobject
        //    //this.set(map.attributes);
        //    _.assign(this.resource, map.map);
        //    this.resetMemberMaps();
        //}

      
    }

    export class MenuRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as IMenuRepresentation;

        constructor() {
            super();
            this.url = this.getUrl;
        }

        getUrl(): string {
            return this.hateoasUrl || this.selfLink().href();
        }

        title(): string {
            return this.wrapped().title;
        }

        menuId(): string {
            return this.wrapped().menuId;
        }

        private memberMap: IMemberMap;
      
        private actionMemberMap: IActionMemberMap;

        private resetMemberMaps() {
            const members = this.wrapped().members;
            this.memberMap = _.mapValues(members, (m, id) => Member.wrapMember(m, this, id));
            this.actionMemberMap = <IActionMemberMap> _.pick(this.memberMap, (m: Member) => m.memberType() === "action");
        }

        private initMemberMaps() {
            if (!this.memberMap) {
                this.resetMemberMaps();
            }
        }

        members(): IMemberMap {
            this.initMemberMaps();
            return this.memberMap;
        }

        actionMembers(): IActionMemberMap {
            this.initMemberMaps();
            return this.actionMemberMap;
        }

        member(id: string): Member {
            return this.members()[id];
        }

        actionMember(id: string): ActionMember {
            return this.actionMembers()[id];
        }

        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }
   
        // linked representations 
        getSelf(): MenuRepresentation {
            return <MenuRepresentation> this.selfLink().getTarget();
        }

    }



    // matches scalar representation 12.0 
    export class ScalarValueRepresentation extends NestedRepresentation {

        wrapped = () => this.resource as RoInterfaces.IScalarValueRepresentation;

        constructor(wrapped : RoInterfaces.IResourceRepresentation) {
            super(wrapped);
        }

        value(): Value {
            return new Value(this.wrapped().value);
        }
    }

    // matches List Representation 11.0
    export class ListRepresentation extends ResourceRepresentation implements IListOrCollection {

        wrapped = () => this.resource as RoInterfaces.IListRepresentation;

        // links
        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        // linked representations 
        getSelf(): ListRepresentation {
            return <ListRepresentation> this.selfLink().getTarget();
        }

        private lazyValue: Link[];

        value(): Link[] {
            this.lazyValue = this.lazyValue || wrapLinks(this.wrapped().value);
            return this.lazyValue;
        }

        pagination(): IPagination {
            return this.wrapped().pagination;
        }
    }

    export interface IErrorDetails {
        message() : string;
        stacktrace() : string[];
    }

    // matches the error representation 10.0 
    export class  ErrorRepresentation extends ResourceRepresentation implements IErrorDetails {
   
        wrapped = () => this.resource as RoInterfaces.IErrorRepresentation;

        static create(message: string, stacktrace?: string[], causedBy?: IErrorDetails) {
            const rawError = {
                links: [], 
                extensions: {}, 
                message: message, 
                stacktrace: stacktrace, 
                causedBy : causedBy
            }
            const error = new ErrorRepresentation();
            error.populate(rawError);
            return error;
        }


        // scalar properties 
        message(): string {
            return this.wrapped().message;
        }

        stacktrace(): string[] {
            return this.wrapped().stackTrace;
        }

        causedBy(): IErrorDetails {
            const cb = this.wrapped().causedBy;
            return cb ? {
                message: () => cb.message,
                stacktrace: () => cb.stackTrace
            } : undefined;
        }
    }

    // matches Objects of Type Resource 9.0 
    export class PersistMap extends HateoasModelBase implements IHateoasModel {

        constructor(private domainObject: DomainObjectRepresentation, private map: RoInterfaces.IObjectOfType) {
            super();
            domainObject.persistLink().copyToHateoasModel(this);
        }

        setMember(name: string, value: Value) {
            value.set(this.map.members, name);
        }

        populate(wrapped: NakedObjects.RoInterfaces.IResourceRepresentation) {
            
        }

        getBody(): RoInterfaces.IRepresentation {
            if (this.method === "POST" || this.method === "PUT") {
                return _.clone(this.map);
            }

            return {};
        }

        getUrl() {
            const url = this.url();
            const attrAsJson = _.clone(this.map);

            if (_.keys(attrAsJson).length > 0 && (this.method === "GET" || this.method === "DELETE")) {

                const urlParmsAsJson = _.clone(this.urlParms);
                const asJson = _.merge(attrAsJson, urlParmsAsJson);
                if (_.keys(asJson).length > 0) {
                    const map = JSON.stringify(asJson);
                    const parmString = encodeURI(map);
                    return url + "?" + parmString;
                }
                return url;
            }

            const urlParmString = _.reduce(this.urlParms || {}, (result, n, key) => (result === "" ? "" : result + "&") + key + "=" + n, "");

            return urlParmString !== "" ? url + "?" + urlParmString : url;
        }
    }

    // matches the version representation 8.0 
    export class VersionRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as RoInterfaces.IVersionRepresentation;

        // links 
        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        upLink(): Link {
            return linkByRel(this.links(), "up");
        }

        // linked representations 
        getSelf(): VersionRepresentation {
            return <VersionRepresentation> this.selfLink().getTarget();
        }

        getUp(): HomePageRepresentation {
            return <HomePageRepresentation> this.upLink().getTarget();
        }

        // scalar properties 
        specVersion(): string {
            return this.wrapped().specVersion;
        }

        implVersion(): string {
            return this.wrapped().implVersion;
        }

        optionalCapabilities(): IOptionalCapabilities {
            return this.wrapped().optionalCapabilities;
        }
    }

    // matches Domain Services Representation 7.0
    export class DomainServicesRepresentation extends ListRepresentation {

        wrapped = () => this.resource as RoInterfaces.IListRepresentation;

        // links
        upLink(): Link {
            return linkByRel(this.links(), "up");
        }

        // linked representations 
        getSelf(): DomainServicesRepresentation {
            return <DomainServicesRepresentation> this.selfLink().getTarget();
        }

        getUp(): HomePageRepresentation {
            return <HomePageRepresentation> this.upLink().getTarget();
        }

        getService(serviceType: string): DomainObjectRepresentation {
            const serviceLink = _.find(this.value(), link => link.rel().parms[0].value === serviceType);
            return <DomainObjectRepresentation> serviceLink.getTarget();
        }
    }

    // custom
    export class MenusRepresentation extends ListRepresentation {

        wrapped = () => this.resource as RoInterfaces.IListRepresentation;

        // links
        upLink(): Link {
            return linkByRel(this.links(), "up");
        }

        // linked representations 
        getSelf(): MenusRepresentation {
            return <MenusRepresentation> this.selfLink().getTarget();
        }

        getUp(): HomePageRepresentation {
            return <HomePageRepresentation> this.upLink().getTarget();
        }

        getMenu(menuId : string): MenuRepresentation {
            const menuLink = _.find(this.value(), link => link.rel().parms[0].value === menuId);
            return <MenuRepresentation> menuLink.getTarget();
        }
    }

    // matches the user representation 6.0
    export class UserRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as RoInterfaces.IUserRepresentation;

        // links 
        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        upLink(): Link {
            return linkByRel(this.links(), "up");
        }

        // linked representations 
        getSelf(): UserRepresentation {
            return <UserRepresentation> this.selfLink().getTarget();
        }

        getUp(): HomePageRepresentation {
            return <HomePageRepresentation> this.upLink().getTarget();
        }

        // scalar properties 
        userName(): string {
            return this.wrapped().userName;
        }
        friendlyName(): string {
            return this.wrapped().friendlyName;
        }
        email(): string {
            return this.wrapped().email;
        }
        roles(): string[] {
            return this.wrapped().roles;
        }
    }

    export class DomainTypeActionInvokeRepresentation extends ResourceRepresentation {

        wrapped = () => this.resource as RoInterfaces.IDomainTypeActionInvokeRepresentation;

        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        // linked representations 
        getSelf(): DomainTypeActionInvokeRepresentation {
            return <DomainTypeActionInvokeRepresentation> this.selfLink().getTarget();
        }

        id(): string {
            return this.wrapped().id;
        }

        value(): boolean {
            return this.wrapped().value;
        }
    }

    // matches the home page representation  5.0 
    export class HomePageRepresentation extends ResourceRepresentation {

        constructor() {
            super();
            this.hateoasUrl = appPath;
        }

        wrapped = () => this.resource as RoInterfaces.IHomePageRepresentation;

        // links 
        serviceLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/services");
        }

        userLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/user");
        }

        selfLink(): Link {
            return linkByRel(this.links(), "self");
        }

        versionLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/version");
        }

        // custom 
        menusLink(): Link {
            return linkByRel(this.links(), "urn:org.restfulobjects:rels/menus");
        }

        // linked representations 
        getSelf(): HomePageRepresentation {
            return <HomePageRepresentation> this.selfLink().getTarget();
        }

        getUser(): UserRepresentation {
            return <UserRepresentation> this.userLink().getTarget();
        }

        getDomainServices(): DomainServicesRepresentation {
            // cannot use getTarget here as that will just return a ListRepresentation 
            const domainServices = new DomainServicesRepresentation();
            this.serviceLink().copyToHateoasModel(domainServices);
            return domainServices;
        }

        getVersion(): VersionRepresentation {
            return <VersionRepresentation> this.versionLink().getTarget();
        }

        //  custom 

        getMenus(): MenusRepresentation {
            // cannot use getTarget here as that will just return a ListRepresentation 
            const menus = new MenusRepresentation();
            this.menusLink().copyToHateoasModel(menus);
            return menus;
        }

    }

    // matches the Link representation 2.7
    export class Link  {

        constructor(public wrapped : RoInterfaces.ILink) { }

        href(): string {
            return this.wrapped.href;
        }

        method(): string {
            return this.wrapped.method;
        }

        rel(): Rel {
            return new Rel(this.wrapped.rel);
        }

        type(): MediaType {
            return new MediaType(this.wrapped.type);
        }

        title(): string {
            return this.wrapped.title;
        }

        arguments(): IValue | RoInterfaces.IValueMap | RoInterfaces.IObjectOfType {
            return this.wrapped.arguments;
        }

        extensions(): IExtensions {
            return this.wrapped.extensions;
        }

        copyToHateoasModel(hateoasModel: IHateoasModel): void {
            hateoasModel.hateoasUrl = this.href();
            hateoasModel.method = this.method();
        }

        private getHateoasTarget(targetType): IHateoasModel {
            const matchingType = this.repTypeToModel[targetType];
            const target: IHateoasModel = new matchingType();
            return target;
        }

        private repTypeToModel = {
            "homepage": HomePageRepresentation,
            "user": UserRepresentation,
            "version": VersionRepresentation,
            "list": ListRepresentation,
            "object": DomainObjectRepresentation,
            "object-property": PropertyRepresentation,
            "object-collection": CollectionRepresentation,
            "object-action": ActionRepresentation,
            "action-result": ActionResultRepresentation,
            "error": ErrorRepresentation,
            "prompt": PromptRepresentation,
            // custom 
            "menu": MenuRepresentation
        }

        // get the object that this link points to 
        getTarget(): IHateoasModel {
            const target = this.getHateoasTarget(this.type().representationType);
            this.copyToHateoasModel(target);
            return target;
        }
    }
}