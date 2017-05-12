import * as Ro from './models';
import * as Msg from './user-messages';
import * as Models from './models';
import { Injectable } from '@angular/core';
import { PaneRouteData, CollectionViewState } from './route-data';
import { ContextService } from './context.service';
import { ConfigService } from './config.service';
import { InteractionMode } from './route-data';
import { MaskService } from './mask.service';
import { getParametersAndCurrentValue } from './cicero-commands/command-result';
import { ErrorService } from './error.service';
import each from 'lodash/each';
import filter from 'lodash/filter';
import forEach from 'lodash/forEach';
import keys from 'lodash/keys';
import some from 'lodash/some';
import reduce from 'lodash/reduce';
import invert from 'lodash/invert';
import { Result } from './cicero-commands/result';

@Injectable()
export class CiceroRendererService {

    constructor(
        private readonly context: ContextService,
        private readonly configService: ConfigService,
        private readonly error: ErrorService,
        private readonly mask: MaskService
    ) {
        this.keySeparator = configService.config.keySeparator;
    }

    protected keySeparator: string;

    private returnResult = (input: string, output: string): Promise<Result> => Promise.resolve(Result.create(input, output));
 
    //TODO: remove renderer.
    renderHome(routeData: PaneRouteData): Promise<Result> {
        if (routeData.menuId) {
            return this.renderOpenMenu(routeData);
        } else {
            return this.returnResult("", Msg.welcomeMessage);
        }
    };

    renderObject(routeData: PaneRouteData): Promise<Result> {

        const oid = Ro.ObjectIdWrapper.fromObjectId(routeData.objectId, this.keySeparator);

        return this.context.getObject(1, oid, routeData.interactionMode) //TODO: move following code out into a ICireroRenderers service with methods for rendering each context type
            .then((obj: Ro.DomainObjectRepresentation) => {
                const openCollIds = this.openCollectionIds(routeData);
                if (some(openCollIds)) {
                    return this.renderOpenCollection(openCollIds[0], obj);
                } else if (obj.isTransient()) {
                    return this.renderTransientObject(routeData, obj);
                } else if (routeData.interactionMode === InteractionMode.Edit ||
                    routeData.interactionMode === InteractionMode.Form) {
                    return this.renderForm(routeData, obj);
                } else {
                    return this.renderObjectTitleAndDialogIfOpen(routeData, obj);
                }
            });

    };

    renderList(routeData: PaneRouteData): Promise<Result> {
        const listPromise = this.context.getListFromMenu(routeData, routeData.page, routeData.pageSize);
        return listPromise.
            then((list: Ro.ListRepresentation) =>
                this.context.getMenu(routeData.menuId).
                    then(menu => {
                        const count = list.value().length;
                        const numPages = list.pagination().numPages;
                        const description = this.getListDescription(numPages, list, count);
                        const actionMember = menu.actionMember(routeData.actionId);
                        const actionName = actionMember.extensions().friendlyName();
                        const output = `Result from ${actionName}:\n${description}`;

                        return this.returnResult("", output);
                    })
            );
    };

    renderError(message: string) {
        const err = this.context.getError().error as Ro.ErrorRepresentation;
        return this.returnResult("", `Sorry, an application error has occurred. ${err.message()}`);
    };

    private getListDescription(numPages: number, list: Ro.ListRepresentation, count: number) {
        if (numPages > 1) {
            const page = list.pagination().page;
            const totalCount = list.pagination().totalCount;
            return `Page ${page} of ${numPages} containing ${count} of ${totalCount} items`;
        } else {
            return `${count} items`;
        }
    }


    //TODO functions become 'private'
    //Returns collection Ids for any collections on an object that are currently in List or Table mode
   

    private renderOpenCollection(collId: string, obj: Ro.DomainObjectRepresentation): Promise<Result> {
        const coll = obj.collectionMember(collId);
        let output = this.renderCollectionNameAndSize(coll);
        output += `(${Msg.collection} ${Msg.on} ${Ro.typePlusTitle(obj)})`;
        return this.returnResult("", output);
    }

    private renderTransientObject(routeData: PaneRouteData, obj: Ro.DomainObjectRepresentation) {
        let output = `${Msg.unsaved} `;
        output += obj.extensions().friendlyName() + "\n";
        output += this.renderModifiedProperties(obj, routeData, this.mask);
        return this.returnResult("", output);
    }

    private renderForm(routeData: PaneRouteData, obj: Ro.DomainObjectRepresentation) {
        let output = `${Msg.editing} `;
        output += Ro.typePlusTitle(obj) + "\n";
        if (routeData.dialogId) {
            return this.context.getInvokableAction(obj.actionMember(routeData.dialogId)).
                then(invokableAction => {
                    output += this.renderActionDialog(invokableAction, routeData, this.mask);
                    return this.returnResult("", output);
                });
        } else {
            output += this.renderModifiedProperties(obj, routeData, this.mask);
            //cvm.clearInputRenderOutputAndAppendAlertIfAny(output);
            return this.returnResult("", output);
        }
    }

    private renderObjectTitleAndDialogIfOpen(routeData: PaneRouteData, obj: Ro.DomainObjectRepresentation) {
        let output = Ro.typePlusTitle(obj) + "\n";
        if (routeData.dialogId) {
            return this.context.getInvokableAction(obj.actionMember(routeData.dialogId)).
                then(invokableAction => {
                    output += this.renderActionDialog(invokableAction, routeData, this.mask);
                    return this.returnResult("", output);
                });
        } else {
            return this.returnResult("", output);
        }
    }

    private renderOpenMenu(routeData: PaneRouteData): Promise<Result> {
        let output = "";
        return this.context.getMenu(routeData.menuId).
            then(menu => {
                output = Msg.menuTitle(menu.title());
                return routeData.dialogId ? this.context.getInvokableAction(menu.actionMember(routeData.dialogId)) : Promise.resolve(null);
            }).
            then(invokableAction => {
                if (invokableAction) {
                    output += `\n${this.renderActionDialog(invokableAction, routeData, this.mask)}`;
                }

                return this.returnResult("", output);
            });
    }

    private renderActionDialog(invokable: Models.ActionRepresentation | Models.InvokableActionMember,
        routeData: PaneRouteData,
        mask: MaskService): string {

        const actionName = invokable.extensions().friendlyName();
        const prefix = `Action dialog: ${actionName}\n`;
        const parms = getParametersAndCurrentValue(invokable, this.context);
        return reduce(parms, (s, value, paramId) => {
            const param = invokable.parameters()[paramId];
            return `${s}${Ro.friendlyNameForParam(invokable, paramId)}: ${this.renderFieldValue(param, value, mask)}\n`;
        }, prefix);
    }

    private renderModifiedProperties(obj: Ro.DomainObjectRepresentation, routeData: PaneRouteData, mask: MaskService): string {
        const props = this.context.getObjectCachedValues(obj.id());
        if (keys(props).length > 0) {
            const prefix = `${Msg.modifiedProperties}:\n`;

            return reduce(props, (s, value, propId) => {
                const pm = obj.propertyMember(propId);
                return `${s}${Ro.friendlyNameForProperty(obj, propId)}: ${this.renderFieldValue(pm, value, mask)}\n`;
            }, prefix);
        }
        return "";
    }

    private renderSingleChoice(field: Ro.IField, value: Ro.Value) {
        //This is to handle an enum: render it as text, not a number:  
        const inverted = invert(field.choices());
        return (<any>inverted)[value.toValueString()];
    }

    private renderMultipleChoicesCommaSeparated(field: Ro.IField, value: Ro.Value) {
        //This is to handle an enum: render it as text, not a number: 
        const inverted = invert(field.choices());
        const values = value.list();
        return reduce(values, (s, v) => `${s}${(<any>inverted)[v.toValueString()]},`, "");
    }

    // helpers 

    renderCollectionNameAndSize(coll: Ro.CollectionMember): string {
        const prefix = `${coll.extensions().friendlyName()}`;
        switch (coll.size()) {
            case 0:
                return `${prefix}: ${Msg.empty}\n`;
            case 1:
                return `${prefix}: 1 ${Msg.item}\n`;
            default:
                return `${prefix}: ${Msg.numberOfItems(coll.size())}\n`;
        }
    }

    openCollectionIds(routeData: PaneRouteData): string[] {
        return filter(keys(routeData.collections), k => routeData.collections[k] !== CollectionViewState.Summary);
    }

    //Handles empty values, and also enum conversion
    renderFieldValue(field: Ro.IField, value: Ro.Value, mask: MaskService): string {
        if (!field.isScalar()) { //i.e. a reference
            return value.isNull() ? Msg.empty : value.toString();
        }
        //Rest is for scalar fields only:
        if (value.toString()) { //i.e. not empty        
            if (field.entryType() === Ro.EntryType.Choices) {
                return this.renderSingleChoice(field, value);
            } else if (field.entryType() === Ro.EntryType.MultipleChoices && value.isList()) {
                return this.renderMultipleChoicesCommaSeparated(field, value);
            }
        }
        let properScalarValue: number | string | boolean | Date;
        if (Ro.isDateOrDateTime(field)) {
            properScalarValue = Ro.toUtcDate(value);
        } else {
            properScalarValue = value.scalar();
        }
        if (properScalarValue === "" || properScalarValue == null) {
            return Msg.empty;
        } else {
            const remoteMask = field.extensions().mask();
            const format = field.extensions().format();
            return mask.toLocalFilter(remoteMask, format).filter(properScalarValue);
        }
    }

}





