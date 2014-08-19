﻿// Copyright © Naked Objects Group Ltd ( http://www.nakedobjects.net). 
// All Rights Reserved. This code released under the terms of the 
// Microsoft Public License (MS-PL) ( http://opensource.org/licenses/ms-pl.html) 
using System;
using NakedObjects.Core.Persist;
using NakedObjects.Xat;
using NUnit.Framework;

namespace NakedObjects.Core {
    [TestFixture]
    public class SerialOidTest : AcceptanceTestCase {

        [SetUp]
        public void Setup() {
            InitializeNakedObjectsFramework();
        }

        [TearDown]
        public void TearDown() {
            CleanupNakedObjectsFramework();
        }


        [Test]
        public void TestEquals() {
            var r = NakedObjectsContext.Reflector;
            SerialOid oid1 = SerialOid.CreateTransient(r, 123, typeof(object).FullName);
            SerialOid oid2 = SerialOid.CreateTransient(r, 123, typeof(object).FullName);
            SerialOid oid3 = SerialOid.CreateTransient(r, 321, typeof(object).FullName);
            SerialOid oid4 = SerialOid.CreatePersistent(r, 321, typeof(object).FullName);
            SerialOid oid5 = SerialOid.CreatePersistent(r, 456, typeof(object).FullName);
            SerialOid oid6 = SerialOid.CreatePersistent(r, 456, typeof(object).FullName);

            Assert.IsTrue(oid1.Equals(oid2));
            Assert.IsTrue(oid2.Equals(oid1));

            Assert.IsFalse(oid1.Equals(oid3));
            Assert.IsFalse(oid3.Equals(oid1));

            Assert.IsTrue(oid5.Equals(oid6));
            Assert.IsTrue(oid6.Equals(oid5));

            Assert.IsFalse(oid4.Equals(oid5));
            Assert.IsFalse(oid5.Equals(oid4));

            Assert.IsFalse(oid3.Equals((Object) oid4));
            Assert.IsFalse(oid4.Equals((Object) oid3));

            Assert.IsFalse(oid3.Equals(oid4));
            Assert.IsFalse(oid4.Equals(oid3));
        }
    }
}