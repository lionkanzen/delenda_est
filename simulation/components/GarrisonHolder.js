/**
 * @class Defines an entity's ability to garrison units.
 */
function GarrisonHolder() {}

GarrisonHolder.prototype.Schema =
	"<element name='Max' a:help='Maximum number of entities which can be garrisoned inside this holder'>" +
		"<data type='positiveInteger'/>" +
	"</element>" +
	"<element name='List' a:help='Classes of entities which are allowed to garrison inside this holder (from Identity)'>" +
		"<attribute name='datatype'>" +
			"<value>tokens</value>" +
		"</attribute>" +
		"<text/>" +
	"</element>" +
	"<element name='EjectHealth' a:help='Percentage of maximum health below which this holder no longer allows garrisoning'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='EjectClassesOnDestroy' a:help='Classes of entities to be ejected on destroy. Others are killed'>" +
		"<attribute name='datatype'>" +
			"<value>tokens</value>" +
		"</attribute>" +
		"<text/>" +
	"</element>" +
	"<element name='BuffHeal' a:help='Number of hit points that will be restored to this holder&apos;s garrisoned units each second'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<element name='LoadingRange' a:help='The maximum distance from this holder at which entities are allowed to garrison. Should be about 2.0 for land entities and preferably greater for ships'>" +
		"<ref name='nonNegativeDecimal'/>" +
	"</element>" +
	"<optional>" +
		"<element name='Pickup' a:help='This garrisonHolder will move to pick up units to be garrisoned'>" +
			"<data type='boolean'/>" +
		"</element>" +
	"</optional>" +
	"<optional>" +
		"<element name='VisibleGarrisonPoints' a:help='Points that will be used to visibly garrison a unit'>" +
			"<zeroOrMore>" +
				"<element a:help='Element containing the offset coordinates'>" +
					"<anyName/>" +
					"<interleave>" +
						"<element name='X'>" +
							"<data type='decimal'/>" +
						"</element>" +
						"<element name='Y'>" +
							"<data type='decimal'/>" +
						"</element>" +
						"<element name='Z'>" +
							"<data type='decimal'/>" +
						"</element>" +
						"<element name='VisibleGarrisonAllowedClasses'>" +
							"<attribute name='datatype'>" +
								"<value>tokens</value>" +
							"</attribute>" +
							"<text/>" +
						"</element>" +
					"</interleave>" +
				"</element>" +
			"</zeroOrMore>" +
		"</element>" +
	"</optional>";

/**
 * Initialize GarrisonHolder Component
 *
 * Garrisoning when loading a map is set in the script of the map, by setting initGarrison
 * which should contain the array of garrisoned entities
 */
GarrisonHolder.prototype.Init = function()
{
	// Garrisoned Units
	this.entities = [];
	this.timer = undefined;
	this.allowGarrisoning = {};
	this.visibleGarrisonPoints = [];
	if (this.template.VisibleGarrisonPoints)
	{
		for each (var offset in this.template.VisibleGarrisonPoints)
		{
			var o = {};
			o.x = +offset.X;
			o.y = +offset.Y;
			o.z = +offset.Z;
			this.visibleGarrisonPoints.push({ "offset": o, "entity": null, "allowedClass": offset.VisibleGarrisonAllowedClasses });
		}
	}
};

/**
 * Return range at which entities can garrison here
 */
GarrisonHolder.prototype.GetLoadingRange = function()
{
	var max = +this.template.LoadingRange;
	return { "max": max, "min": 0 };
};

/**
 * Return true if this garrisonHolder can pickup ent
 */
GarrisonHolder.prototype.CanPickup = function(ent)
{
	if (!this.template.Pickup || this.IsFull())
		return false;
	var cmpOwner = Engine.QueryInterface(this.entity, IID_Ownership);
	if (!cmpOwner)
		return false;
	var player = cmpOwner.GetOwner();
	return IsOwnedByPlayer(player, ent);
};

/**
 * Return the list of entities garrisoned inside
 */
GarrisonHolder.prototype.GetEntities = function()
{
	return this.entities;
};

/**
 * Returns an array of unit classes which can be garrisoned inside this
 * particualar entity. Obtained from the entity's template
 */
GarrisonHolder.prototype.GetAllowedClasses = function()
{
	return this.template.List._string;
};

/**
 * Get Maximum pop which can be garrisoned
 */
GarrisonHolder.prototype.GetCapacity = function()
{
	return ApplyValueModificationsToEntity("GarrisonHolder/Max", +this.template.Max, this.entity);
};

/**
 * Return true if this garrisonHolder is full
 */
GarrisonHolder.prototype.IsFull = function()
{
	return this.GetGarrisonedEntitiesCount() >= this.GetCapacity();
};

/**
 * Get the heal rate with which garrisoned units will be healed
 */
GarrisonHolder.prototype.GetHealRate = function()
{
	return ApplyValueModificationsToEntity("GarrisonHolder/BuffHeal", +this.template.BuffHeal, this.entity);
};

/**
 * Set this entity to allow or disallow garrisoning in
 * Every component calling this function should do it with its own ID, and as long as one
 * component doesn't allow this entity to garrison, it can't be garrisoned
 * When this entity already contains garrisoned soldiers,
 * these will not be able to ungarrison until the flag is set to true again.
 *
 * This more useful for modern-day features. For example you can't garrison or ungarrison
 * a driving vehicle or plane.
 */
GarrisonHolder.prototype.AllowGarrisoning = function(allow, callerID)
{
	this.allowGarrisoning[callerID] = allow;
};

/**
 * Check if no component of this entity blocks garrisoning
 * (f.e. because the vehicle is moving too fast)
 */
GarrisonHolder.prototype.IsGarrisoningAllowed = function()
{
	for each (var allow in this.allowGarrisoning)
	{
		if (!allow)
			return false;
	}
	return true;
};

/**
 * Return the number of recursively garrisoned units
 */
GarrisonHolder.prototype.GetGarrisonedEntitiesCount = function()
{
	var count = 0;
	for each (var ent in this.entities)
	{
		count++;
		var cmpGarrisonHolder = Engine.QueryInterface(ent, IID_GarrisonHolder);
		if (cmpGarrisonHolder)
			count += cmpGarrisonHolder.GetGarrisonedEntitiesCount();
	}
	return count;
};

/**
 * Checks if an entity can be allowed to garrison in the building
 * based on its class
 */
GarrisonHolder.prototype.AllowedToGarrison = function(entity)
{
	if (!this.IsGarrisoningAllowed())
		return false;

	var cmpIdentity = Engine.QueryInterface(entity, IID_Identity);
	if (!cmpIdentity)
		return false;
	var entityClasses = cmpIdentity.GetClassesList();
	return MatchesClassList(entityClasses, this.template.List._string);
};

/**
 * Returns true if the unit is allowed be visible on that garrison point, false otherwise.
 */
GarrisonHolder.prototype.AllowedToVisibleGarrisoning = function(visibleGarrisonPoint, entity)
{
	return MatchesClassList(Engine.QueryInterface(entity, IID_Identity).GetClassesList(), visibleGarrisonPoint.allowedClass._string);
};

/**
 * Garrison a unit inside.
 * Returns true if successful, false if not
 * The timer for AutoHeal is started here
 * if vgpEntity is given, this visualGarrisonPoint will be used for the entity
 */
GarrisonHolder.prototype.Garrison = function(entity, vgpEntity)
{
	var cmpPosition = Engine.QueryInterface(entity, IID_Position);
	if (!cmpPosition)
		return false;

	if (!this.PerformGarrison(entity))
		return false;

	let visibleGarrisonPoint = vgpEntity;
	if (!visibleGarrisonPoint)
	{
		for (let vgp of this.visibleGarrisonPoints)
		{
			if (vgp.entity)
				continue;
			if (this.AllowedToVisibleGarrisoning(vgp, entity))
			{
				visibleGarrisonPoint = vgp;
				break;
			}
		}
	}
	if (visibleGarrisonPoint && this.AllowedToVisibleGarrisoning(visibleGarrisonPoint, entity))
	{
		visibleGarrisonPoint.entity = entity;
		cmpPosition.SetTurretParent(this.entity, visibleGarrisonPoint.offset);
		let cmpUnitAI = Engine.QueryInterface(entity, IID_UnitAI);
		if (cmpUnitAI)
			cmpUnitAI.SetTurretStance();
	}
	else
		cmpPosition.MoveOutOfWorld();

	let visible = {};
	visible[entity] = this.IsVisiblyGarrisoned(entity);
	// Should only be called after the garrison has been performed else the visible Garrison Points are not updated yet.
	Engine.PostMessage(this.entity, MT_GarrisonedUnitsChanged, {
		"added": [entity],
		"removed": [],
		"visible": visible
	});
	return true;
};

/**
 * Garrison units inside the entity
 * @return true if successful, false if not
 */
GarrisonHolder.prototype.PerformGarrison = function(entity)
{
	if (!this.HasEnoughHealth())
		return false;

	// Check if the unit is allowed to be garrisoned inside the building
	if (!this.AllowedToGarrison(entity))
		return false;

	// Check the capacity
	var extraCount = 0;
	var cmpGarrisonHolder = Engine.QueryInterface(entity, IID_GarrisonHolder);
	if (cmpGarrisonHolder)
		extraCount += cmpGarrisonHolder.GetGarrisonedEntitiesCount();
	if (this.GetGarrisonedEntitiesCount() + extraCount >= this.GetCapacity())
		return false;

	if (!this.timer && this.GetHealRate() > 0)
	{
 		var cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		this.timer = cmpTimer.SetTimeout(this.entity, IID_GarrisonHolder, "HealTimeout", 1000, {});
	}

	// Actual garrisoning happens here
	this.entities.push(entity);
	this.UpdateGarrisonFlag();
	var cmpProductionQueue = Engine.QueryInterface(entity, IID_ProductionQueue);
	if (cmpProductionQueue)
		cmpProductionQueue.PauseProduction();

	var cmpAura = Engine.QueryInterface(entity, IID_Auras);
	if (cmpAura && cmpAura.HasGarrisonAura())
		cmpAura.ApplyGarrisonBonus(this.entity);

	var cmpUnitAI = Engine.QueryInterface(entity, IID_UnitAI);
	if (cmpUnitAI && cmpUnitAI.IsUnderAlert())
		Engine.PostMessage(cmpUnitAI.GetAlertRaiser(), MT_UnitGarrisonedAfterAlert, {"holder": this.entity, "unit": entity});

	return true;
};

/**
 * Simply eject the unit from the garrisoning entity without
 * moving it
 * Returns true if successful, false if not
 */
GarrisonHolder.prototype.Eject = function(entity, forced)
{
	var entityIndex = this.entities.indexOf(entity);
	// Error: invalid entity ID, usually it's already been ejected
	if (entityIndex == -1)
		return false; // Fail

	// Find spawning location
	var cmpFootprint = Engine.QueryInterface(this.entity, IID_Footprint);
	var cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
	var cmpIdentity = Engine.QueryInterface(this.entity, IID_Identity);
	// If the garrisonHolder is a sinking ship, restrict the location to the intersection of both passabilities
	// TODO: should use passability classes to be more generic
	if ((!cmpHealth || cmpHealth.GetHitpoints() == 0) && cmpIdentity && cmpIdentity.HasClass("Ship"))
		var pos = cmpFootprint.PickSpawnPointBothPass(entity);
	else
		var pos = cmpFootprint.PickSpawnPoint(entity);

	if (pos.y < 0)
	{
		// Error: couldn't find space satisfying the unit's passability criteria
		if (forced)
		{	// If ejection is forced, we need to continue, so use center of the building
			var cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
			pos = cmpPosition.GetPosition();
		}
		else
		{	// Fail
			return false;
		}
	}

	var cmpNewPosition = Engine.QueryInterface(entity, IID_Position);
	this.entities.splice(entityIndex, 1);
	
	let visible = {};
	visible[entity] = this.IsVisiblyGarrisoned(entity);
	// Should only be called before the ejection has been performed else the visible Garrison Points will be empty.
	Engine.PostMessage(this.entity, MT_GarrisonedUnitsChanged, {
		"added": [],
		"removed": [entity],
		"visible": visible
	});
	for (var vgp of this.visibleGarrisonPoints)
	{
		if (vgp.entity != entity)
			continue;
		cmpNewPosition.SetTurretParent(INVALID_ENTITY, new Vector3D());
		var cmpUnitAI = Engine.QueryInterface(entity, IID_UnitAI);
		if (cmpUnitAI)
			cmpUnitAI.ResetTurretStance();
		vgp.entity = null;
		break;
	}

	var cmpUnitAI = Engine.QueryInterface(entity, IID_UnitAI);
	if (cmpUnitAI)
		cmpUnitAI.Ungarrison();

	var cmpProductionQueue = Engine.QueryInterface(entity, IID_ProductionQueue);
	if (cmpProductionQueue)
		cmpProductionQueue.UnpauseProduction();

	var cmpAura = Engine.QueryInterface(entity, IID_Auras);
	if (cmpAura && cmpAura.HasGarrisonAura())
		cmpAura.RemoveGarrisonBonus(this.entity);


	cmpNewPosition.JumpTo(pos.x, pos.z);
	cmpNewPosition.SetHeightOffset(0);
	// TODO: what direction should they face in?


	return true;
};

/**
 * Order entities to walk to the Rally Point
 */
GarrisonHolder.prototype.OrderWalkToRallyPoint = function(entities)
{
	var cmpOwnership = Engine.QueryInterface(this.entity, IID_Ownership);
	var cmpRallyPoint = Engine.QueryInterface(this.entity, IID_RallyPoint);
	if (cmpRallyPoint)
	{
		var rallyPos = cmpRallyPoint.GetPositions()[0];
		if (rallyPos)
		{
			var commands = GetRallyPointCommands(cmpRallyPoint, entities);
			// ignore the rally point if it is autogarrison
			if (commands[0].type == "garrison" && commands[0].target == this.entity)
				return;
			for each (var com in commands)
			{
				ProcessCommand(cmpOwnership.GetOwner(), com);
			}
		}
	}
};

/**
 * Ejects units and orders them to move to the Rally Point.
 * Returns true if successful, false if not
 * If an ejection with a given obstruction radius has failed, we won't try anymore to eject
 * entities with a bigger obstruction as that is compelled to also fail
 */
GarrisonHolder.prototype.PerformEject = function(entities, forced)
{
	if (!this.IsGarrisoningAllowed() && !forced)
		return false;

	var ejectedEntities = [];
	var success = true;
	var failedRadius;
	for (var entity of entities)
	{
		if (failedRadius !== undefined)
		{
			var cmpObstruction = Engine.QueryInterface(entity, IID_Obstruction);
			var radius = cmpObstruction ? cmpObstruction.GetUnitRadius() : 0;
			if (radius >= failedRadius)
				continue;
		}

		if (this.Eject(entity, forced))
		{
			var cmpOwnership = Engine.QueryInterface(this.entity, IID_Ownership);
			var cmpEntOwnership = Engine.QueryInterface(entity, IID_Ownership);
			if (cmpOwnership && cmpEntOwnership && cmpOwnership.GetOwner() == cmpEntOwnership.GetOwner())
				ejectedEntities.push(entity);
		}
		else
		{
			success = false;
			if (failedRadius !== undefined)
				failedRadius = Math.min(failedRadius, radius);
			else
			{
				var cmpObstruction = Engine.QueryInterface(entity, IID_Obstruction);
				failedRadius = cmpObstruction ? cmpObstruction.GetUnitRadius() : 0;
			}
		}
	}

	this.OrderWalkToRallyPoint(ejectedEntities);
	this.UpdateGarrisonFlag();

	return success;
};

/**
 * Unload unit from the garrisoning entity and order them
 * to move to the Rally Point
 * Returns true if successful, false if not
 */
GarrisonHolder.prototype.Unload = function(entity, forced)
{
	return this.PerformEject([entity], forced);
};

/**
 * Unload one or all units that match a template and owner from
 * the garrisoning entity and order them to move to the Rally Point
 * Returns true if successful, false if not
 *
 * extendedTemplate has the format "p"+ownerid+"&"+template
 */
GarrisonHolder.prototype.UnloadTemplate = function(extendedTemplate, all, forced)
{
	let index = extendedTemplate.indexOf("&");
	if (index == -1)
		return false;

	let entities = [];
	let visibleEntities = [];
	let entitiesMatching = [];
	let entitiesNotOwned = [];
	let entitiesNotMatchingName = [];
	let owner = +extendedTemplate.slice(1, index);
	let template = extendedTemplate.slice(index + 1);
	let cmpTemplateManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager);

	entitiesNotOwned=  this.entities.filter(e =>  Engine.QueryInterface(e, IID_Ownership).GetOwner()  != owner);
	entitiesNotMatchingName = this.entities.filter(e =>  (Engine.QueryInterface(e, IID_Identity).GetSelectionGroupName() || cmpTemplateManager.GetCurrentTemplateName(e))  != template);

	for (let entity of this.entities)
		if(!entitiesNotOwned.some(e=> e == entity) && ! entitiesNotMatchingName.some(e=> e == entity))
			entitiesMatching.push(entity);

	for (let entity of entitiesMatching)
	{
		if (this.IsVisiblyGarrisoned(entity))
			visibleEntities.push(entity);
		else
			entities.push(entity);

		// If 'all' is false, only ungarrison the first matched unit and if possible,  one that 's not visible.
		if (!all)
		{
			if (!entities.length)
			{
				if (entitiesMatching.length !== visibleEntities.length)
					continue;

				if (visibleEntities.length)
					entities.push(visibleEntities[0]);
			}
			break;
		}
	}
	if (all)
		entities.push.apply(entities,visibleEntities);
	return this.PerformEject(entities, forced);
};

/**
 * Unload all units, that belong to certain player
 * and order all own units to move to the Rally Point
 * Returns true if all successful, false if not
 */
GarrisonHolder.prototype.UnloadAllByOwner = function(owner, forced)
{
	var entities = this.entities.filter(ent => {
		var cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
		return cmpOwnership && cmpOwnership.GetOwner() == owner;
	});
	return this.PerformEject(entities, forced);
};

/**
 * Unload all units from the entity
 * and order them to move to the Rally Point
 * Returns true if all successful, false if not
 */
GarrisonHolder.prototype.UnloadAll = function(forced)
{
	var entities = this.entities.slice();
	return this.PerformEject(entities, forced);
};

/**
 * Used to check if the garrisoning entity's health has fallen below
 * a certain limit after which all garrisoned units are unloaded
 */
GarrisonHolder.prototype.OnHealthChanged = function(msg)
{
	if (!this.HasEnoughHealth() && this.entities.length)
	{
		var entities = this.entities.slice();
		this.EjectOrKill(entities);
	}
};

/**
 * Check if this entity has enough health to garrison units inside it
 */
GarrisonHolder.prototype.HasEnoughHealth = function()
{
	var cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
	var hitpoints = cmpHealth.GetHitpoints();
	var maxHitpoints = cmpHealth.GetMaxHitpoints();
	var ejectHitpoints = Math.floor((+this.template.EjectHealth) * maxHitpoints);
	return hitpoints > ejectHitpoints;
};

/**
 * Called every second. Heals garrisoned units
 */
GarrisonHolder.prototype.HealTimeout = function(data)
{
	if (this.entities.length == 0)
	{
		var cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		cmpTimer.CancelTimer(this.timer);
		this.timer = undefined;
	}
	else
	{
		for each (var entity in this.entities)
		{
			var cmpHealth = Engine.QueryInterface(entity, IID_Health);
			if (cmpHealth)
			{
				// We do not want to heal unhealable units
				if (!cmpHealth.IsUnhealable())
					cmpHealth.Increase(this.GetHealRate());
			}
		}
		var cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		this.timer = cmpTimer.SetTimeout(this.entity, IID_GarrisonHolder, "HealTimeout", 1000, {});
	}
};

GarrisonHolder.prototype.UpdateGarrisonFlag = function()
{
	let cmpVisual = Engine.QueryInterface(this.entity, IID_Visual);
	if (!cmpVisual)
		return;
	let selection = this.entities.length ? "garrisoned" : "ungarrisoned";
	cmpVisual.SetVariant("garrison", selection);
};

/**
 * Cancel timer when destroyed
 */
GarrisonHolder.prototype.OnDestroy = function()
{
	if (this.timer)
	{
		var cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		cmpTimer.CancelTimer(this.timer);
	}
};

/**
 * If a garrisoned entity is captured, or about to be killed (so its owner
 * changes to '-1'), remove it from the building so we only ever contain valid
 * entities
 */
GarrisonHolder.prototype.OnGlobalOwnershipChanged = function(msg)
{
	// the ownership change may be on the garrisonholder
	if (this.entity == msg.entity)
	{
		var entities = [];
		for each (var entity in this.entities)
		{
			if (msg.to == -1 || !IsOwnedByMutualAllyOfEntity(this.entity, entity))
				entities.push(entity);
		}
		if (entities.length)
			this.EjectOrKill(entities);
		return;
	}

	// or on some of its garrisoned units
	let entityIndex = this.entities.indexOf(msg.entity);
	if (entityIndex != -1)
	{
		// If the entity is dead, remove it directly instead of ejecting the corpse
		let cmpHealth = Engine.QueryInterface(msg.entity, IID_Health);
		if (cmpHealth && cmpHealth.GetHitpoints() == 0)
		{
			this.entities.splice(entityIndex, 1);
			let visible = {};
			visible[msg.entity] = this.IsVisiblyGarrisoned(msg.entity);
			Engine.PostMessage(this.entity, MT_GarrisonedUnitsChanged, {
				"added": [],
				"removed": [msg.entity],
				"visible": visible
			});
			this.UpdateGarrisonFlag();

			for (var pt of this.visibleGarrisonPoints)
				if (pt.entity == msg.entity)
					pt.entity = null;
		}
		else if (msg.to == -1 || !IsOwnedByMutualAllyOfEntity(this.entity, msg.entity))
			this.EjectOrKill([msg.entity]);
	}
};

/**
 * Update list of garrisoned entities if one gets renamed (e.g. by promotion)
 * vgpEntity is only defined in some peculiar case where we want to reuse the same visibleGarrisonPoint,
 * in case of promotion for example, and thus should always be allowed. 
 */
GarrisonHolder.prototype.OnGlobalEntityRenamed = function(msg)
{
	var entityIndex = this.entities.indexOf(msg.entity);
	if (entityIndex != -1)
	{
		let vgpRenamed;
		for (let vgp of this.visibleGarrisonPoints)
		{
			if (vgp.entity != msg.entity)
				continue;
			vgpRenamed = vgp;
			break;
		}
		this.Eject(msg.entity);
		this.Garrison(msg.newentity, vgpRenamed);
	}

	if (!this.initGarrison)
		return;

	// update the pre-game garrison because of SkirmishReplacement
	if (msg.entity == this.entity)
	{
		let cmpGarrisonHolder = Engine.QueryInterface(msg.newentity, IID_GarrisonHolder);
		if (cmpGarrisonHolder)
			cmpGarrisonHolder.initGarrison = this.initGarrison;
	}
	else
	{
		let entityIndex = this.initGarrison.indexOf(msg.entity);
		if (entityIndex != -1)
			this.initGarrison[entityIndex] = msg.newentity;
	}
};

/**
 * Eject all foreign garrisoned entities which are no more allied
 */
GarrisonHolder.prototype.OnDiplomacyChanged = function()
{
	var entities = this.entities.filter(ent => !IsOwnedByMutualAllyOfEntity(this.entity, ent));
	this.EjectOrKill(entities);
};

/**
 * Eject or kill a garrisoned unit which can no more be garrisoned
 * (garrisonholder's health too small or ownership changed)
 */
GarrisonHolder.prototype.EjectOrKill = function(entities)
{
	var cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	// Eject the units which can be ejected (if not in world, it often means this holder
	// is inside a holder which kills its entities, so do not eject)
	if (cmpPosition.IsInWorld())
	{
		var cmpGarrisonHolder = this;
		var ejectables = entities.filter(function(ent) { return cmpGarrisonHolder.IsEjectable(ent); });
		if (ejectables.length)
			this.PerformEject(ejectables, false);
	}

	// And destroy all remaining entities
	var killedEntities = [];
	for each (var entity in entities)
	{
		var entityIndex = this.entities.indexOf(entity);
		if (entityIndex == -1)
			continue;
		var cmpHealth = Engine.QueryInterface(entity, IID_Health);
		if (cmpHealth)
			cmpHealth.Kill();
		this.entities.splice(entityIndex, 1);
		killedEntities.push(entity);
	}
	if (killedEntities.length > 0)
	{
		let visibleEntitiesIds = {};
		for (let ent of killedEntities)
			visibleEntitiesIds[ent] = this.IsVisiblyGarrisoned(ent);
		Engine.PostMessage(this.entity, MT_GarrisonedUnitsChanged, { 
			"added": [], 
			"removed": killedEntities,
			"visible": visibleEntitiesIds
		});
	}
	this.UpdateGarrisonFlag();
};

/**
 * Gives insight about the unit type of garrisoning.
 * @return{bool} returns true if the unit is visible on the structure
 * @param {int} the entity's id
 */
GarrisonHolder.prototype.IsVisiblyGarrisoned = function(entity)
{
	return this.visibleGarrisonPoints.some(point => point.entity == entity);
};

/**
 * Checks if an entity is ejectable on destroy if possible
 */
GarrisonHolder.prototype.IsEjectable = function(entity)
{
	var ejectableClasses = this.template.EjectClassesOnDestroy._string;
	ejectableClasses = ejectableClasses ? ejectableClasses.split(/\s+/) : [];
	var entityClasses = (Engine.QueryInterface(entity, IID_Identity)).GetClassesList();
	for each (var ejectableClass in ejectableClasses)
		if (entityClasses.indexOf(ejectableClass) != -1)
			return true;

	return false;
};

/**
 * Initialise the garrisoned units
 */
GarrisonHolder.prototype.OnGlobalInitGame = function(msg)
{
	if (!this.initGarrison)
		return;

	for (let ent of this.initGarrison)
	{
		let cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		if (cmpUnitAI && cmpUnitAI.CanGarrison(this.entity) && this.Garrison(ent))
			cmpUnitAI.SetGarrisoned();
	}
	this.initGarrison = undefined;
};

Engine.RegisterComponentType(IID_GarrisonHolder, "GarrisonHolder", GarrisonHolder);

