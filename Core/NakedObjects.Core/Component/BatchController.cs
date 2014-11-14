﻿// Copyright Naked Objects Group Ltd, 45 Station Road, Henley on Thames, UK, RG9 1AT
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. 
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0.
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and limitations under the License.

using NakedObjects.Architecture.Component;

namespace NakedObjects.Core.Component {
    public class BatchController : IBatchController {
        private readonly IBatchStartPoint batchStartPoint;
        private readonly INakedObjectsFramework framework;

        public BatchController(INakedObjectsFramework framework, IBatchStartPoint batchStartPoint) {
            this.framework = framework;
            this.batchStartPoint = batchStartPoint;
            framework.Injector.InitDomainObject(batchStartPoint);
        }

        protected void StartTransaction() {
            framework.TransactionManager.StartTransaction();
        }

        protected void EndTransaction() {
            framework.TransactionManager.EndTransaction();
        }

        public virtual void Run() {
            StartTransaction();
            batchStartPoint.Execute();
            EndTransaction();
        }
    }
}